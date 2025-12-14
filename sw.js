let cached = ["./", "./script.js", "./style.css"]
let cachePos = 0

setInterval(async () => {
    let url = cached[cachePos++]
    if (!url) return cachePos = cached.length
    let keys = await caches.keys()
    for (let key of keys) {
        let cache = await caches.open(key)
        if (key == location.pathname) {
            console.log("Caching", url, "...")
            cache.add(url)
        } else {
            cache.delete(url)
        }
    }
}, 1024)

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
        cached = ["./", "./script.js", "./style.css"]
        cachePos = 0
        return event.respondWith(fetch(event.request))
    }
    url = url.split("?")[0]
    url = url.split("#")[0]
    // console.log("Fetch detected:", method, url)

    event.respondWith((async () => (await caches.match(url)) || (await fetch(url)))())

    if (!cached.includes(url)) cached.push(url)
})