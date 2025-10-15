export default class Queue extends EventTarget {
    inbox = []
    outbox = []
    pipes = []
    errPipes = []

    isInitialized = false
    isProcessing = false
    currentTask = null

    constructor() {
        super()
        this.notify = this.notify.bind(this)
    }

    queue(task) {
        if (task) {
            this.inbox.push(task)
            this.dispatchEvent(new Event("statuschange"))
        }
        setTimeout(this.notify)
    }

    clear() {
        this.inbox = []
        this.dispatchEvent(new Event("statuschange"))
    }

    async restart() {
        this.isProcessing = true
        if (this.isInitialized) {
            this.isInitialized = false
            await this.shutdown()
            this.isProcessing = true
        }
        this.dispatchEvent(new Event("statuschange"))
        try {
            this.isInitialized = !!(await this.init())
        } catch (error) {
            console.error("restart err!", error)
            this.isInitialized = false
            this.shutdown()
            this.deliverErr(error)
        }
        this.isProcessing = false
        this.dispatchEvent(new Event("statuschange"))
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
            this.dispatchEvent(new Event("statuschange"))
            product = await this.process(this.currentTask)
            this.deliver(product)
        } catch (error) {
            console.error("process err!", error)
            this.isInitialized = false
            this.shutdown()
            this.dispatchEvent(new Event("statuschange"))
            this.deliverErr(error)
        }
    }

    async init() {
        this.isInitialized = true
        this.dispatchEvent(new Event("statuschange"))
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
        this.dispatchEvent(new Event("statuschange"))
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
        if (this.inbox.length == 0) this.dispatchEvent(new Event("statuschange"))
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
        this.dispatchEvent(new Event("statuschange"))
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

}