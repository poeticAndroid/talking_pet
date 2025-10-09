import Queue from "./Queue.js"

export default class AI extends Queue {
    job = ""
    model = ""
    options = {}
    worker = null
    initStage = 0
    resolve = null
    reject = null

    constructor(job = this.job, model = this.model, options = this.options) {
        super()
        this._onMessage = this._onMessage.bind(this)
        this.job = job
        this.model = model
        this.options = options
    }

    init() {
        if (this.worker) return true;
        return new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
            this.initStage = 0
            this.worker = new Worker('worker.js', { type: "module" })
            this.worker.addEventListener("message", this._onMessage)
        })
    }

    process(task) {
        return new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
            this.worker.postMessage({ cmd: "process", args: [task.input, this.options] })
        })
    }

    shutdown() {
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
                this.worker.postMessage({ cmd: "init", args: [this.job, this.model, this.options] })
                this.initStage++
                break;

            default:
                for (let key in this.currentTask) product[key] = this.currentTask[key]
                if (this.resolve) this.resolve(product)
                else throw "no resolver!"
                this.resolve = null
                this.reject = null
        }
    }
}