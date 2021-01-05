export interface IBus {
    wr8(addr: number, value: number): void;
    wr16(addr: number, value: number): void;
    wr32(addr: number, value: number): void;

    rd8(addr: number): number;
    rd16(addr: number): number;
    rd32(addr: number): number;
}

export interface IIrqSource {
    GetActiveIRQ(): number;
}
