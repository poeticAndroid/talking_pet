import Queue from "./Queue.js"

export default class Speaker extends Queue {
    container = document.createElement("article")
    audioCtx = new AudioContext()
    audioSource

    constructor(container, audioCtx) {
        super()
        this.container = container || this.container
        this.audioCtx = audioCtx || this.audioCtx
        let beep = (e => {
            let osc = this.audioCtx.createOscillator()
            osc.connect(this.audioCtx.destination)
            osc.start()
            setTimeout((e) => { osc.stop() }, 32)
            document.body.removeEventListener("click", beep)
        }).bind(this)
        document.body.addEventListener("click", beep)
    }

    process(speech) {
        return new Promise((resolve, reject) => {
            let audioBuffer = this.audioCtx.createBuffer(
                1,
                speech.audio.length,
                speech.sampling_rate
            )
            audioBuffer.copyToChannel(speech.audio, 0)
            this.audioSource = this.audioCtx.createBufferSource()
            this.audioSource.buffer = audioBuffer
            this.audioSource.connect(this.audioCtx.destination)
            this.audioSource.start()
            let span = this.container?.querySelector("#sentence_" + speech.id)
            span?.classList.remove("queued")
            span?.classList.add("speaking")
            span?.scrollIntoView(true)
            this.audioSource.addEventListener("ended", e => {
                span?.classList.remove("unread")
                span?.classList.remove("queued")
                span?.classList.remove("speaking")
                span?.classList.add("read")
                this.audioSource.disconnect(this.audioCtx.destination)
                this.audioSource = null
                resolve()
            })
        })
    }

    shutdown() {
        if (!this.audioSource) return;
        this.audioSource.disconnect(this.audioCtx.destination)
        this.audioSource = null
        return super.shutdown()
    }

}

let _id = 1
