import { Cpu } from "./cpu";
import { IBus, IIrqSource } from "./IBus";
import { Memory } from "./Memory";

export class Machine implements IBus, IIrqSource {
    public readonly memory: Memory;
    public readonly cpu: Cpu;
    

    public constructor() {
        this.memory = new Memory(8 * 1024 * 1024);
        this.cpu = new Cpu(this);
    }

    GetActiveIRQ(): number {
        return 0;
    }

    public wr8(addr: number, value: number): void {
        this.memory.wr8(addr, value);
    }

    public wr16(addr: number, value: number): void {
        this.memory.wr16(addr, value);
    }

    public wr32(addr: number, value: number): void {
        if (addr < 0x0800_0000)
            this.memory.wr32(addr, value);
    }

    public rd8(addr: number): number {
        return this.memory.rd8(addr);
    }

    public rd16(addr: number): number {
        return this.memory.rd16(addr);
    }

    public rd32(addr: number): number {
        if (addr < 0x0800_0000)
            return this.memory.rd32(addr);
    }


}