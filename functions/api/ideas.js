const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Helper to read current ideas from KV
  async function getIdeas() {
    const raw = await env.IDEAS_KV.get('ideas');
    return raw ? JSON.parse(raw) : [];
  }

  // Helper to write ideas to KV
  async function putIdeas(ideas) {
    await env.IDEAS_KV.put('ideas', JSON.stringify(ideas));
  }

  // Helper to return JSON response
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    // GET — return all ideas
    if (method === 'GET') {
      const ideas = await getIdeas();
      return json(ideas);
    }

    // POST — add a new idea
    if (method === 'POST') {
      const body = await request.json();
      const ideas = await getIdeas();
      const newIdea = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        author: body.author || 'Unknown',
        category: body.category || 'other',
        text: body.text || '',
        done: false,
        completedAt: null,
      };
      ideas.push(newIdea);
      await putIdeas(ideas);
      return json(newIdea, 201);
    }

    // PATCH — edit the text of an idea, or mark it complete / reopen it
    if (method === 'PATCH') {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
      if (!id) return json({ error: 'Missing id' }, 400);

      const body = await request.json();
      const ideas = await getIdeas();
      const idx = ideas.findIndex(i => i.id === id);
      if (idx === -1) return json({ error: 'Not found' }, 404);

      const idea = ideas[idx];

      // Update the wording
      if (typeof body.text === 'string') {
        const trimmed = body.text.trim();
        if (!trimmed) return json({ error: 'Text cannot be empty' }, 400);
        idea.text = trimmed.slice(0, 5000);
        idea.editedAt = Date.now();
      }

      // Update the category
      if (typeof body.category === 'string' && body.category) {
        idea.category = body.category;
      }

      // Toggle completion. Stamp the date on completion, clear it on reopen.
      if (typeof body.done === 'boolean') {
        idea.done = body.done;
        idea.completedAt = body.done ? Date.now() : null;
      }

      ideas[idx] = idea;
      await putIdeas(ideas);
      return json(idea);
    }

    // DELETE — remove an idea by id
    if (method === 'DELETE') {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
      if (!id) return json({ error: 'Missing id' }, 400);
      const ideas = await getIdeas();
      const filtered = ideas.filter(i => i.id !== id);
      if (filtered.length === ideas.length) return json({ error: 'Not found' }, 404);
      await putIdeas(filtered);
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
