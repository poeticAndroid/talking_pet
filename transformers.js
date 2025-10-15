// worker.js (module)
import { pipeline, TextStreamer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";

let ai, streamer

self.addEventListener("message", async (e) => {
    // console.log("worker got:", e.data)
    switch (e.data.cmd) {
        case "init":
            try {
                let options = e.data.args.pop()
                ai = await pipeline(...e.data.args, options)
                if (options.streamer) streamer = new TextStreamer(ai.tokenizer, {
                    skip_prompt: true,
                    callback_function: postToken
                })
                self.postMessage({ success: true, id: e.data.id })
            } catch (error) {
                self.postMessage({ success: false, status: error, id: e.data.id })
            }
            break;

        case "process":
            try {
                let options = e.data.args.pop()
                if (options.streamer) options.streamer = streamer
                let res = await ai(...e.data.args, options)
                res.success = true
                res.status = "finished"
                res.id = e.data.id
                self.postMessage(res)
            } catch (error) {
                self.postMessage({ success: false, status: error, id: e.data.id })
            }
            break;

        default:
            self.postMessage({ success: false, status: "unknown cmd", id: e.data.id })
            break;
    }
});

function postToken(token) {
    self.postMessage({ success: true, status: "streaming", token: token })
}

self.postMessage({ success: true, status: "ready" })