console.log("Starting service worker", location.pathname)

setTimeout(async () => {
    let old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10) // 10 days ago
    let cache = await caches.open(location.pathname)
    let reqs = await cache.keys()
    for (let req of reqs) {
        let resp = await cache.match(req)
        let date = new Date(resp.headers.get("Date"))
        if (date < old) {
            console.log("Purging", req.url, "...")
            cache.delete(req)
        }
    }
}, 1024 * 64)

addEventListener("fetch", async (event) => {
    let method = "" + event.request.method
    let url = "" + event.request.url
    if (method.toLowerCase() != "get") return event.respondWith(fetch(event.request))
    if (url.includes("?clear")) {
        console.log("Cache is cleared! 💣")
        caches.delete(location.pathname)
        return event.respondWith(fetch(event.request))
    }
    url = url.split("?")[0]
    url = url.split("#")[0]
    // console.log("Fetch detected:", method, url)
    event.respondWith(cacheFirst(url))
})

async function cacheFirst(url) {
    let cache = await caches.open(location.pathname)
    let resp = await cache.match(url)

    if (resp?.ok) {
        recache(url)
        return resp
    } else {
        return recache(url)
    }
}

async function recache(url) {
    let resp
    try {
        resp = await fetch(url)
        if (resp?.ok) {
            let cache = await caches.open(location.pathname)
            await cache.put(url, resp.clone())
        }
    } catch (error) { }
    return resp
}
