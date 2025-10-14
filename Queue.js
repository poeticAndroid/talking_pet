export default class Queue {
    inbox = []
    outbox = []
    pipes = []
    errPipes = []
    listeners = []

    isInitialized = false
    isProcessing = false
    currentTask = null

    constructor() {
        this.notify = this.notify.bind(this)
    }

    queue(task) {
        this.inbox.push(task);
        this.emitEvent("statuschange")
        setTimeout(this.notify)
    }

    clear() {
        this.inbox = []
        this.emitEvent("statuschange")
    }

    async restart() {
        this.isProcessing = true
        if (this.isInitialized) {
            this.isInitialized = false
            await this.shutdown()
            this.isProcessing = true
        }
        try {
            this.isInitialized = !!(await this.init())
        } catch (error) {
            console.error("restart err!", error)
            this.isInitialized = false
            this.shutdown()
            this.deliverErr(error)
        }
        this.isProcessing = false
        this.emitEvent("statuschange")
        setTimeout(this.notify)
        return this.isInitialized
    }

    async notify() {
        if (this.isProcessing) return false;
        if (this.inbox.length == 0) return false;
        if (!this.isInitialized) return this.restart()
        this.isProcessing = true
        let product
        try {
            this.currentTask = this.inbox.shift()
            this.emitEvent("statuschange")
            product = await this.process(this.currentTask)
            this.deliver(product)
        } catch (error) {
            console.error("process err!", error)
            this.isInitialized = false
            this.shutdown()
            this.emitEvent("statuschange")
            this.deliverErr(error)
        }
    }

    async init() {
        this.isInitialized = true
        this.emitEvent("statuschange")
        return this.isInitialized
    }

    async process(task) {
        return task
        throw "process method not implemented!"
    }

    async skip() {
        let q = [...this.inbox]
        await this.shutdown()
        q.forEach(t => this.queue(t))
    }

    async shutdown() {
        this.clear()
        this.isProcessing = false
        this.isInitialized = false
        this.emitEvent("statuschange")
        return this.isInitialized
    }

    deliver(product) {
        if (product) this.outbox.push(product)
        if (this.pipes.length) {
            while (product = this.outbox.shift()) {
                for (let pipe of this.pipes) {
                    pipe.queue(product)
                }
            }
        }
        this.currentTask = null
        this.isProcessing = false
        if (this.inbox.length == 0) this.emitEvent("statuschange")
        setTimeout(this.notify)
    }

    deliverErr(err) {
        if (this.errPipes.length) {
            for (let pipe of this.errPipes) {
                pipe.queue(err)
            }
        }
        this.currentTask = null
        this.isProcessing = false
        this.emitEvent("statuschange")
    }

    pipeTo(queue) {
        if (this.pipes.indexOf(queue) < 0) this.pipes.push(queue)
        return queue
    }
    removePipeTo(queue) {
        if (this.pipes.indexOf(queue) >= 0) this.pipes.splice(this.pipes.indexOf(queue), 1)
    }

    pipeErrTo(queue) {
        if (this.errPipes.indexOf(queue) < 0) this.errPipes.push(queue)
        return queue
    }
    removePipeErrTo(queue) {
        if (this.errPipes.indexOf(queue) >= 0) this.errPipes.splice(this.errPipes.indexOf(queue), 1)
    }

    addEventListener(event, listener) {
        if (event == "statuschange" && this.listeners.indexOf(listener) < 0) this.listeners.push(listener)
        return listener
    }
    removeEventListener(event, listener) {
        if (this.listeners.indexOf(listener) >= 0) this.listeners.splice(this.listeners.indexOf(listener), 1)
    }
    emitEvent(event) {
        if (this._emitting) return;
        this._emitting = setTimeout(() => {
            this._emitting = false
            for (let listener of this.listeners) {
                listener(this)
            }
        }, 32)
    }

    _emitting
}