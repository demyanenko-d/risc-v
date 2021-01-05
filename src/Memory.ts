import { IBus } from "./IBus";


export class Memory implements IBus {
    private readonly size: number;
    private readonly memory: ArrayBuffer;

    public readonly u8memory: Uint8Array;
    public readonly u16memory: Uint16Array;
    public readonly u32memory: Uint32Array;

    public constructor(size: number) {
        this.size = size;

        this.memory = new ArrayBuffer(size);
        this.u8memory = new Uint8Array(this.memory);
        this.u16memory = new Uint16Array(this.memory);
        this.u32memory = new Uint32Array(this.memory);
    }

    public wr8(addr: number, value: number) {
        if (addr >= this.size)
            return;
        this.u8memory[addr] = value;
    }

    public wr16(addr: number, value: number) {
        if (addr >= this.size)
            return;
        this.u16memory[addr >> 1] = value;
    }

    public wr32(addr: number, value: number) {
        if (addr >= this.size)
            return;
        this.u32memory[addr >> 2] = value;
    }

    public rd8(addr: number): number {
        if (addr >= this.size)
            return 0;

        return this.u8memory[addr];
    }

    public rd16(addr: number): number {
        if (addr >= this.size)
            return 0;

        return this.u16memory[addr >> 1];
    }

    public rd32(addr: number): number {
        if (addr >= this.size)
            return 0;

        return this.u32memory[addr >> 2];
    }
}
