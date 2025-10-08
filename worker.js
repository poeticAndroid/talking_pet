// worker.js (module)
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";

let ai

self.addEventListener("message", async (e) => {
    switch (e.data.cmd) {
        case "init":
            ai = await pipeline(...e.data.args)
            self.postMessage({ success: true })
            break;

        case "process":
            let res = await ai(...e.data.args)
            res.success = true
            self.postMessage(res)
            break;

        default:
            self.postMessage({ success: false, status: "unknown cmd" })
            break;
    }
});

self.postMessage({ ready: true })