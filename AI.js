import Queue from "./Queue.js"

export default class AI extends Queue {
    config = {}
    worker = null
    initStage = 0
    resolve = null
    reject = null

    constructor(config = {}) {
        super()
        this._onMessage = this._onMessage.bind(this)
        this.config = config
    }

    init() {
        if (this.worker) return true;
        return new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
            this.initStage = 0
            this.worker = new Worker((this.config.library || "none") + ".js", { type: "module" })
            this.worker.addEventListener("message", this._onMessage)
        })
    }

    process(task) {
        return new Promise((resolve, reject) => {
            if (!this.worker) reject({ success: false, status: new Error("model not loaded!") })
            this.resolve = resolve
            this.reject = reject
            this.worker.postMessage({ cmd: "process", args: [task.input, this.config] })
        })
    }

    shutdown() {
        if (this.resolve) this.resolve()
        if (!this.worker) return;
        this.resolve = null
        this.reject = null
        this.initStage = 0
        this.worker.removeEventListener("message", this._onMessage)
        this.worker.terminate()
        this.worker = null
        return super.shutdown()
    }

    _onMessage(e) {
        let product = e.data
        if (!product.success) {
            if (this.reject) this.reject(product)
            else throw product
            return;
        }
        switch (this.initStage) {
            case 0:
                this.worker.postMessage({ cmd: "init", args: [this.config.task, this.config.model, this.config] })
                this.initStage++
                break;

            default:
                for (let key in this.currentTask) product[key] = this.currentTask[key]
                if (this.resolve) this.resolve(product)
                else throw new Error("no resolver!")
                this.resolve = null
                this.reject = null
        }
    }
}