export default {
  async fetch(request, env, ctx) {
    // The name of your Azure OpenAI Resource.
    const resourceName = env.RESOURCE_NAME;
    // The deployment name you chose when you deployed the model.
    const mapper = env.DEPLOY_NAMES || {};
    const apiVersion = env.API_VERSION || "2023-12-01-preview"; // default fallback

    if (request.method === 'OPTIONS') {
      return handleOPTIONS(request);
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("//")) {
      url.pathname = url.pathname.replace('/', "");
    }

    let path;
    switch (url.pathname) {
      case '/v1/chat/completions':
        path = "chat/completions";
        break;
      case '/v1/images/generations':
        path = "images/generations";
        break;
      case '/v1/completions':
        path = "completions";
        break;
      case '/v1/models':
        return handleModels(mapper);
      default:
        return new Response('404 Not Found', { status: 404 });
    }

    let body;
    if (request.method === 'POST') {
      body = await request.json();
    }

    const modelName = body?.model;
    const deployName = mapper[modelName] || '';

    if (deployName === '') {
      return new Response('Missing model mapper', {
        status: 403
      });
    }

    const fetchAPI = `https://${resourceName}.openai.azure.com/openai/deployments/${deployName}/${path}?api-version=${apiVersion}`;

    const authKey = request.headers.get('Authorization');
    if (!authKey) {
      return new Response("Not allowed", {
        status: 403
      });
    }

    const payload = {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "api-key": authKey.replace('Bearer ', ''),
      },
      body: typeof body === 'object' ? JSON.stringify(body) : '{}',
    };

    let response = await fetch(fetchAPI, payload);
    response = new Response(response.body, response);
    response.headers.set("Access-Control-Allow-Origin", "*");

    if (body?.stream !== true) {
      return response;
    }

    let { readable, writable } = new TransformStream();
    stream(response.body, writable);
    return new Response(readable, response);
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// support printer mode and add newline
async function stream(readable, writable) {
  const reader = readable.getReader();
  const writer = writable.getWriter();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  // let decodedValue = decoder.decode(value);
  const newline = "\n";
  const delimiter = "\n\n";
  const encodedNewline = encoder.encode(newline);

  let buffer = "";
  while (true) {
    let { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }); // stream: true is important here,fix the bug of incomplete line
    let lines = buffer.split(delimiter);

    // Loop through all but the last line, which may be incomplete.
    for (let i = 0; i < lines.length - 1; i++) {
      await writer.write(encoder.encode(lines[i] + delimiter));
      await sleep(20);
    }

    buffer = lines[lines.length - 1];
  }

  if (buffer) {
    await writer.write(encoder.encode(buffer));
  }
  await writer.write(encodedNewline);
  await writer.close();
}

async function handleModels(mapper) {
  const data = {
    "object": "list",
    "data": Object.keys(mapper).map(key => ({
      "id": key,
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai",
      "permission": [{
        "id": "modelperm-M56FXnG1AsIr3SXq8BYPvXJA",
        "object": "model_permission",
        "created": 1679602088,
        "allow_create_engine": false,
        "allow_sampling": true,
        "allow_logprobs": true,
        "allow_search_indices": false,
        "allow_view": true,
        "allow_fine_tuning": false,
        "organization": "*",
        "group": null,
        "is_blocking": false
      }],
      "root": key,
      "parent": null
    }))
  };

  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleOPTIONS(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*'
    }
  });
}