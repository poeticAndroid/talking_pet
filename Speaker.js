import Queue from "./Queue.js"

export default class Speaker extends Queue {
    container = document.createElement("article")
    audioCtx = new AudioContext()
    audioSource

    hmmm
    ah

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
        if (speech.input == "hmmm...") this.hmmm = this.hmmm || speech
        if (speech.input == "ah!") this.ah = this.ah || speech
        return new Promise((resolve, reject) => {
            let eventName
            if (speech.audio) {
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
                eventName = "ended"
            } else {
                this.audioSource = new SpeechSynthesisUtterance(speech.input)
                this.audioSource.lang = speech.options?.lang || "en-US"
                this.audioSource.pitch = speech.options?.pitch || 1
                this.audioSource.rate = speech.options?.rate || 1
                if (speech.options?.voice) {
                    for (let voice of speechSynthesis.getVoices()) {
                        if (voice.name.toLocaleLowerCase().includes(speech.options.voice.toLocaleLowerCase())) this.audioSource.voice = voice
                    }
                }
                speechSynthesis.speak(this.audioSource)
                eventName = "end"
            }

            let span = this.container?.querySelector("#sentence_" + speech.id)
            span?.classList.remove("queued")
            span?.classList.add("speaking")
            span?.scrollIntoView(true)
            this.audioSource.addEventListener(eventName, e => {
                span?.classList.remove("unread")
                span?.classList.remove("queued")
                span?.classList.remove("speaking")
                span?.classList.add("read")
                this.audioSource.disconnect?.(this.audioCtx.destination)
                this.audioSource = null
                resolve()
            })
        })
    }

    shutdown() {
        this.container?.querySelectorAll(".speaking").forEach(el => el.classList.remove("speaking"))
        speechSynthesis?.cancel?.()
        if (!this.audioSource) return;
        this.audioSource?.disconnect?.(this.audioCtx.destination)
        this.audioSource = null
        this.container?.querySelectorAll(".queued").forEach(el => el.classList.remove("queued"))
        return super.shutdown()
    }

}

let _id = 1
