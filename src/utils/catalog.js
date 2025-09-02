// src/routes/catalog.js (snippet)
const { getWithSWR, getKey } = require('../utils/swr-cache');

router.post('/catalog/preview', async (req,res)=>{
  const { userId, listId, page=1 } = req.body;
  const key = getKey(userId, listId, page);
  const { data, served } = await getWithSWR({
    key,
    maxAgeSec: 60,       // fresh for 60s
    swrSec: 120,         // then revalidate in background for 2m
    revalidateFn: async () => {
      // your current buildCatalog/list fetch logic
      return await buildCatalogForUserList({ userId, listId, page });
    }
  });
  res.set('Cache-Control','no-store'); // API is dynamic; we manage caching server-side
  res.json({ served, items: data });
});
