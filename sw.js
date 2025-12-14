let cached = ["./", "./script.js", "./style.css"]
let cachePos = 0

setInterval(async () => {
    let url = cached[cachePos++]
    if (!url) return cachePos = cached.length
    let keys = await caches.keys()
    for (let key of keys) {
        let cache = await caches.open(key)
        if (key == location.pathname) {
            console.log("Fetching", url, "...")
            cache.add(url)
        } else {
            cache.delete(url)
        }
    }
}, 1024)

addEventListener("activate", (event) => {
    console.log("Activating service worker...", location.pathname)
    setTimeout(async () => {
        console.log("Updating cache...")
        let cache = await caches.open(location.pathname)
        let reqs = await cache.keys()
        for (let req of reqs) if (!cached.includes(req.url)) cached.push(req.url)
    }, 1024 * 8)
})

addEventListener("fetch", async (event) => {
    let method = "" + event.request.method
    let url = "" + event.request.url
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
    if (method.toLowerCase() != "get") return event.respondWith(fetch(event.request))

    event.respondWith((async () => (await caches.match(url)) || (await fetch(url)))())

    if (!cached.includes(url)) cached.push(url)
})