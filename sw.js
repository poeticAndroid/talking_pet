let cached = ["./", "./script.js", "./style.css"]
let cachePos = 0

setInterval(async () => {
    let url = cached[cachePos++]
    if (!url) return cachePos = cached.length
    let cache = await caches.open("v1")
    console.log("Fetching", url, "...")
    cache.add(url)
}, 1024)

addEventListener("install", (event) => {
    console.log("Installing service worker...")
    setTimeout(async () => {
        console.log("Updating cache...")
        let cache = await caches.open("v1")
        let reqs = await cache.keys()
        for (let req of reqs) if (!cached.includes(req.url)) cached.push(req.url)
    }, 1024 * 64)
})

addEventListener("fetch", async (event) => {
    let method = "" + event.request.method
    let url = "" + event.request.url
    if (url.includes("?clear")) {
        caches.delete("v1")
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