self.addEventListener("message", async (e) => {
    switch (e.data.cmd) {
        case "init":
            setTimeout(() => {
                self.postMessage({ success: true, id: e.data.id })
            }, 256)
            break;

        case "process":
            setTimeout(() => {
                let res = {}
                res.options = e.data.args.pop()
                res.success = true
                res.id = e.data.id
                self.postMessage(res)
            }, 128)
            break;

        default:
            self.postMessage({ success: false, status: "unknown cmd", id: e.data.id })
            break;
    }
});

self.postMessage({ success: true, status: "ready" })
