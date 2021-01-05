import { IBus, IIrqSource } from "./IBus";
import * as ct from "./ctypes";
import { exception } from "console";
import { off } from "process";

export enum Opcode {
    LOAD = 0b00_000_11,         // 0x03
    MISC_MEM = 0b00_011_11,     // 0x0f
    OP_IMM = 0b00_100_11,       // 0x13
    AUIPC = 0b00_101_11,        // 0x17
    STORE = 0b01_000_11,        // 0x23
    OP = 0b01_100_11,           // 0x33
    LUI = 0b01_101_11,          // 0x37
    BRANCH = 0b11_000_11,       // 0x63
    JALR = 0b11_001_11,         // 0x67
    JAL = 0b11_011_11,          // 0x6f
    SYSTEM = 0b11_100_11,       // 0x73
}

export enum CSR {
    // USER LEVEL
    USTATUS = 0x000,
    UTVEC = 0x005,
    UEPC = 0x041,
    UCAUSE = 0x042,
    UTVAL = 0x043,
    TIME = 0xc01,

    // SUPERVISOR LEVEL
    SSTATUS = 0x100,
    SEDELEG = 0x102,
    SIDELEG = 0x103,
    SIE = 0x104,
    STVEC = 0x105,
    SSCRATCH = 0x140,
    SEPC = 0x141,
    SCAUSE = 0x142,
    STVAL = 0x143,
    SIP = 0x144,
    SATP = 0x180,

    // MACHINE LEVEL
    MVENDORID = 0xf11,
    MARCHID = 0xf12,
    MIMPID = 0xf13,
    MHARTID = 0xf14,
    MSTATUS = 0x300,
    MISA = 0x301,
    MEDELEG = 0x302,
    MIDELEG = 0x303,
    MIE = 0x304,
    MTVEC = 0x305,
    MCOUNTEREN = 0x306,
    MSCRATCH = 0x340,
    MEPC = 0x341,
    MCAUSE = 0x342,
    MTVAL = 0x343,
    MIP = 0x344,
    PMPCFG0 = 0x3a0,
    PMPADDR0 = 0x3b0,
}

export const enum SSTATUS {
    SIE = 0x00000002,
    SPIE = 0x00000020,
    SPP = 0x00000100,
    VS = 0x00000600,
    FS = 0x00006000,
    XS = 0x00018000,
    SUM = 0x00040000,
    MXR = 0x00080000,
}

export const enum MIP {
    SSIP = 1 << 1,
    MSIP = 1 << 3,
    STIP = 1 << 5,
    MTIP = 1 << 7,
    SEIP = 1 << 9,
    MEIP = 1 << 11,
}

export const enum Mode {
    User = 0b00,
    Supervisor = 0b01,
    Machine = 0b11,
    Debug,
}

export const enum CpuException {
    IllegalInstruction = 2,
    Breakpoint = 3,
    EnvironmentCallFrom_UMode = 8,
    EnvironmentCallFrom_SMode = 9,
    EnvironmentCallFrom_MMode = 11,
}

export const enum Interrupt {
    UserSoftwareInterrupt = 0,
    SupervisorSoftwareInterrupt = 1,
    MachineSoftwareInterrupt = 3,
    UserTimerInterrupt = 4,
    SupervisorTimerInterrupt = 5,
    MachineTimerInterrupt = 7,
    UserExternalInterrupt = 8,
    SupervisorExternalInterrupt = 9,
    MachineExternalInterrupt = 11,
}

export class CpuCSR {
    public readonly regs = new Uint32Array(4096);

    constructor() {
        this.Reset();
    }

    public Reset() {
        for (let i = 0; i < this.regs.length; i++)
            this.regs[i] = 0;

        const misa =
            (1 << 30) | // MXL[1:0]=1 (XLEN is 32)
            (1 << 18) | // Extensions[18] (Supervisor mode implemented)
            (1 << 8) | // Extensions[8] (RV32I/64I/128I base ISA)
            0;

        this.regs[CSR.MISA] = misa;
    }

    public Wr32(addr: number, value: number) {
        let mask = 0;
        switch (addr as CSR) {
            case CSR.MVENDORID:
            case CSR.MARCHID:
            case CSR.MIMPID:
            case CSR.MHARTID:
                break;
            case CSR.SSTATUS:
                mask = SSTATUS.SIE
                    | SSTATUS.SPIE
                    | SSTATUS.SPP
                    | SSTATUS.FS
                    | SSTATUS.XS
                    | SSTATUS.SUM
                    | SSTATUS.MXR;

                this.regs[CSR.MSTATUS] = (this.regs[CSR.MSTATUS] & ~mask) | (value & mask);
                break;
            case CSR.SIE:
                this.regs[CSR.MIE] = (this.regs[CSR.MIE] & ~this.regs[CSR.MIDELEG]) | (value & this.regs[CSR.MIDELEG]);
                break;
            case CSR.SIP:
                mask = MIP.SSIP & this.regs[CSR.MIDELEG];
                this.regs[CSR.MIP] = (this.regs[CSR.MIP] & ~mask) | (value & mask);
                break;
            default:
                this.regs[addr & 0xfff] = value;
        }
    }

    public Rd32(addr: number): number {
        switch (addr as CSR) {
            case CSR.SSTATUS:
                let mask = SSTATUS.SIE
                    | SSTATUS.SPIE
                    | SSTATUS.SPP
                    | SSTATUS.FS
                    | SSTATUS.XS
                    | SSTATUS.SUM
                    | SSTATUS.MXR;
                return this.regs[CSR.MSTATUS] & mask;
            case CSR.SIE:
                return this.regs[CSR.MIE] & this.regs[CSR.MIDELEG];
            case CSR.SIP:
                return this.regs[CSR.MIP] & this.regs[CSR.MIDELEG];
            default:
                return this.regs[addr];
        }
    }

    public Set32(addr: number, mask: number) {
        this.Wr32(addr, this.Rd32(addr) | mask);
    }

    public Clr32(addr: number, mask: number) {
        this.Wr32(addr, this.Rd32(addr) & ~mask);
    }

    public RdBit(addr: number, bit: number): number | undefined {
        if (bit > 31)
            return undefined;

        return ((this.Rd32(addr) & (1 << bit)) != 0) ? 1 : 0;
    }

    public WrBit(addr: number, bit: number, value: number | undefined) {
        if (bit > 31) return;
        if (value > 1) return;

        if (value == 1)
            this.Wr32(addr, this.Rd32(addr) | 1 << bit);
        else if (value == 0)
            this.Wr32(addr, this.Rd32(addr) & ~(1 << bit));
    }

    public RdBits(addr: number, start: number, bitcnt: number): number | undefined {
        if ((start + bitcnt) > 31)
            return undefined;

        let mask = 0;
        for (let i = 0; i < bitcnt; i++)
            mask |= 1 << (start + i);

        let val = this.Rd32(addr) & mask;
        return val >>> start;
    }


    public WrBits(addr: number, start: number, bitcnt: number, value: number) {
        if ((start + bitcnt) > 31)
            return;

        let mask = 0;
        for (let i = 0; i < bitcnt; i++)
            mask |= 1 << (start + i);

        let val = this.Rd32(addr) & ~mask;
        val |= (value << start) & mask;

        this.Wr32(addr, value);
    }
}

const abi = [
    "zero", " ra ", " sp ", " gp ", " tp ", " t0 ", " t1 ", " t2 ", " s0 ", " s1 ", " a0 ",
    " a1 ", " a2 ", " a3 ", " a4 ", " a5 ", " a6 ", " a7 ", " s2 ", " s3 ", " s4 ", " s5 ",
    " s6 ", " s7 ", " s8 ", " s9 ", " s10", " s11", " t3 ", " t4 ", " t5 ", " t6 ",
];

function abi_name(i: number) {
    return `x${(i + "  ").slice(0, 2)}(${abi[i]})`;
}

export class Cpu {

    private readonly regs: ArrayBuffer;
    private readonly i32regs: Int32Array;
    private readonly bus: IBus & IIrqSource;

    private prev_mode: Mode;

    public readonly u32regs: Uint32Array;
    public readonly state: CpuCSR;

    public pc: number;
    public mode: Mode;

    public debug: boolean = false;

    public constructor(bus: IBus & IIrqSource) {
        this.bus = bus;

        this.regs = new ArrayBuffer(32 * 4);
        this.u32regs = new Uint32Array(this.regs);
        this.i32regs = new Int32Array(this.regs);

        this.state = new CpuCSR();
        this.Reset();
    }

    public Reset(pc: number = 0) {
        for (let i = 0; i < this.u32regs.length; i++) {
            this.u32regs[i] = 0;
        }

        this.pc = pc;
        this.mode = Mode.Machine;
        this.prev_mode = Mode.Machine;
        this.state.Reset();

        if (this.debug) {
            console.log(`dbg: reset: pc:${pc.toString(16)} mode:${this.mode}`);
        }
    }

    public Exec(): void {

        let irq = this.UpdateIrqPending();

        if (irq !== false) {
            this.PendingInterrupt(irq);
        }

        this.TimerIncrement();

        try {
            this.ExecInner();
        } catch (trap) {
            console.log("TRAP: " + trap);
            this.Trap(trap);
        }
    }

    private ExecInner(): void {
        const inst = this.bus.rd32(this.pc);

        this.pc += 4;

        let opcode = inst & 0x0000007f as Opcode;
        let rd = (inst & 0x00000f80) >>> 7;
        let rs1 = (inst & 0x000f8000) >>> 15;
        let rs2 = (inst & 0x01f00000) >>> 20;
        let funct3 = (inst & 0x00007000) >>> 12;
        let funct7 = (inst & 0xfe000000) >>> 25;

        let imm = 0;
        let val = 0;
        let offset = 0;
        let addr = 0;
        let shamt = 0;
        let t = 0;

        this.u32regs[0] = 0;

        switch (opcode) {
            case Opcode.LOAD:      // 0x03 I-type
                offset = ct.i32_u32((ct.u32_i32(inst) >> 20));
                addr = (this.u32regs[rs1] + offset) & 0xffff_ffff;

                switch (funct3) {
                    case 0x0: // LB
                        val = ct.u8_i8(this.bus.rd8(addr));
                        this.i32regs[rd] = val;
                        if (this.debug) console.log(`dbg: exec: lb ${abi_name(rd)}, ${addr.toString(16)} // #${val.toString(16)}`)
                        return;
                    case 0x1: // LH
                        val = ct.u16_i16(this.bus.rd16(addr));
                        this.i32regs[rd] = val;
                        if (this.debug) console.log(`dbg: exec: lh ${abi_name(rd)}, ${addr.toString(16)} // #${val.toString(16)}`)
                        return;
                    case 0x2: // LW
                        val = this.bus.rd32(addr);
                        this.u32regs[rd] = val;
                        if (this.debug) console.log(`dbg: exec: lw ${abi_name(rd)}, ${addr.toString(16)} // #${val.toString(16)}`)
                        return;
                    case 0x4: // LBU
                        val = this.bus.rd8(addr);
                        this.u32regs[rd] = val;
                        if (this.debug) console.log(`dbg: exec: lbu ${abi_name(rd)}, ${addr.toString(16)} // #${val.toString(16)}`)
                        return;
                    case 0x5: // LHU
                        val = this.bus.rd16(addr);
                        this.u32regs[rd] = val;
                        if (this.debug) console.log(`dbg: exec: lhu ${abi_name(rd)}, ${addr.toString(16)} // #${val.toString(16)}`)
                        return;
                    default:
                        throw CpuException.IllegalInstruction;
                }

            case Opcode.MISC_MEM:  // 0x0f
                switch (funct3) {
                    case 0x0:
                    case 0x1:
                        return;
                    default:
                        throw CpuException.IllegalInstruction;
                }

            case Opcode.OP_IMM:    // 0x13 I-type
                imm = ct.i32_u32((inst & 0xfff00000) >> 20);
                shamt = (inst & 0x01f0_0000) >> 20;

                switch (funct3) {
                    case 0x0: // ADDI
                        this.u32regs[rd] = this.u32regs[rs1] + imm;
                        if (this.debug) if (this.debug) console.log(`dbg: exec: addi ${abi_name(rd)}, ${abi_name(rs1)}, #${imm.toString(16)}(${imm | 0}) `);
                        return;
                    case 0x1: // SLLI
                        this.u32regs[rd] = this.u32regs[rs1] << shamt;
                        if (this.debug) if (this.debug) console.log(`dbg: exec: slli ${abi_name(rd)}, ${abi_name(rs1)}, ${shamt} `);
                        return;
                    case 0x2: // SLTI
                        this.u32regs[rd] = this.i32regs[rs1] < ct.u32_i32(imm) ? 1 : 0;
                        if (this.debug) if (this.debug) console.log(`dbg: exec: slti ${abi_name(rd)}, ${abi_name(rs1)}, #${imm.toString(16)}(${imm | 0}) `);
                        return;
                    case 0x3: // SLTUI
                        this.u32regs[rd] = this.u32regs[rs1] < imm ? 1 : 0;
                        if (this.debug) if (this.debug) console.log(`dbg: exec: sltui ${abi_name(rd)}, ${abi_name(rs1)}, ${imm.toString(16)}(${imm >>> 0}) `);
                        return;
                    case 0x4: // XORI
                        this.u32regs[rd] = this.u32regs[rs1] ^ imm;
                        if (this.debug) if (this.debug) console.log(`dbg: exec: xori ${abi_name(rd)}, ${abi_name(rs1)}, ${imm.toString(16)} `);
                        return;
                    case 0x5:
                        let funct6 = funct7 >> 1;
                        switch (funct6) {
                            case 0x0: // SRLI
                                this.u32regs[rd] = this.u32regs[rs1] >>> imm;
                                if (this.debug) if (this.debug) console.log(`dbg: exec: srli ${abi_name(rd)}, ${abi_name(rs1)}, ${imm} `);
                                return;
                            case 0x10: // SRAI
                                this.i32regs[rd] = this.i32regs[rs1] >> imm;
                                if (this.debug) if (this.debug) console.log(`dbg: exec: srai ${abi_name(rd)}, ${abi_name(rs1)}, ${imm} `);
                                return;
                            default:
                                throw CpuException.IllegalInstruction;
                        }
                    case 0x6: // ORI
                        this.u32regs[rd] = this.u32regs[rs1] | imm;
                        if (this.debug) if (this.debug) console.log(`dbg: exec: ori ${abi_name(rd)}, ${abi_name(rs1)}, ${imm.toString(16)} `);
                        return;
                    case 0x7: // ANDI
                        this.u32regs[rd] = this.u32regs[rs1] & imm;
                        if (this.debug) if (this.debug) console.log(`dbg: exec: andi ${abi_name(rd)}, ${abi_name(rs1)}, ${imm.toString(16)} `);
                        return;
                    default:
                        throw CpuException.IllegalInstruction;
                }

            case Opcode.AUIPC:     // 0x17 U-type (RV32I)
                imm = inst & 0xfffff000;
                this.u32regs[rd] = this.pc + imm - 4;
                if (this.debug) console.log(`dbg: exec: auipc ${abi_name(rd)}, #${imm.toString(16)}(${imm | 0}) // #${this.u32regs[rd].toString(16)}(${this.u32regs[rd]})`);
                return;

            case Opcode.STORE:     // 0x23 S-type
                imm = ((inst & 0xfe000000) >> 20) | ((inst >> 7) & 0x1f);
                addr = (this.u32regs[rs1] + imm) & 0xffff_ffff;

                switch (funct3) {
                    case 0: // SB
                        this.bus.wr8(addr, this.u32regs[rs2]);
                        if (this.debug) console.log(`dbg: exec: sb ${addr.toString(16)}, ${abi_name(rs2)}`);
                        return;
                    case 1: // SH
                        this.bus.wr16(addr, this.u32regs[rs2]);
                        if (this.debug) console.log(`dbg: exec: sh ${addr.toString(16)}, ${abi_name(rs2)}`);
                        return;
                    case 2: // SW
                        this.bus.wr32(addr, this.u32regs[rs2]);
                        if (this.debug) console.log(`dbg: exec: sw ${addr.toString(16)}, ${abi_name(rs2)}`);
                        return;
                    default:
                        throw CpuException.IllegalInstruction;
                }

            case Opcode.OP:        // 0x33 R-type
                shamt = this.u32regs[rs2] & 0x1f;

                switch (true) {
                    case funct3 == 0x0 && funct7 == 0x00: // ADD
                        this.u32regs[rd] = this.u32regs[rs1] + this.u32regs[rs2];
                        if (this.debug) console.log(`dbg: exec: add ${abi_name(rd)}, ${abi_name(rs1)}, ${abi_name(rs2)}`);
                        return;
                    case funct3 == 0x0 && funct7 == 0x20: // SUB
                        this.u32regs[rd] = this.u32regs[rs1] - this.u32regs[rs2];
                        if (this.debug) console.log(`dbg: exec: sub ${abi_name(rd)}, ${abi_name(rs1)}, ${abi_name(rs2)}`);
                        return;
                    case funct3 == 0x1 && funct7 == 0x00: // SLL
                        this.u32regs[rd] = this.u32regs[rs1] << shamt;
                        if (this.debug) console.log(`dbg: exec: sll ${abi_name(rd)}, ${abi_name(rs1)}, ${shamt}`);
                        return;
                    case funct3 == 0x2 && funct7 == 0x00: // SLT
                        this.u32regs[rd] = this.i32regs[rs1] < this.i32regs[rs2] ? 1 : 0;
                        if (this.debug) console.log(`dbg: exec: slt ${abi_name(rd)}, ${abi_name(rs1)}, ${abi_name(rs2)}`);
                        return;
                    case funct3 == 0x3 && funct7 == 0x00: // SLTU
                        this.u32regs[rd] = this.u32regs[rs1] < this.u32regs[rs2] ? 1 : 0;
                        if (this.debug) console.log(`dbg: exec: sltu ${abi_name(rd)}, ${abi_name(rs1)}, ${abi_name(rs2)}`);
                        return;
                    case funct3 == 0x4 && funct7 == 0x00: // XOR
                        this.u32regs[rd] = this.u32regs[rs1] ^ this.u32regs[rs2];
                        if (this.debug) console.log(`dbg: exec: xor ${abi_name(rd)}, ${abi_name(rs1)}, ${abi_name(rs2)}`);
                        return;
                    case funct3 == 0x5 && funct7 == 0x00: // SRL
                        this.u32regs[rd] = this.u32regs[rs1] >>> shamt;
                        if (this.debug) console.log(`dbg: exec: srl ${abi_name(rd)}, ${abi_name(rs1)}, ${shamt}`);
                        return;
                    case funct3 == 0x5 && funct7 == 0x20: // SRA
                        this.i32regs[rd] = this.i32regs[rs1] >> shamt;
                        if (this.debug) console.log(`dbg: exec: sra ${abi_name(rd)}, ${abi_name(rs1)}, ${shamt}`);
                        return;
                    case funct3 == 0x6 && funct7 == 0x00: // OR
                        this.u32regs[rd] = this.u32regs[rs1] | this.u32regs[rs2];
                        if (this.debug) console.log(`dbg: exec: or ${abi_name(rd)}, ${abi_name(rs1)}, ${abi_name(rs2)}`);
                        return;
                    case funct3 == 0x7 && funct7 == 0x00: // AND
                        this.u32regs[rd] = this.u32regs[rs1] & this.u32regs[rs2];
                        if (this.debug) console.log(`dbg: exec: and ${abi_name(rd)}, ${abi_name(rs1)}, ${abi_name(rs2)}`);
                        return;
                    default:
                        throw CpuException.IllegalInstruction;
                }

            case Opcode.LUI:       // 0x37  U-type
                this.u32regs[rd] = inst & 0xfffff000;
                if (this.debug) console.log(`dbg: exec: lui ${abi_name(rd)}, #${((inst & 0xfffff000) >>> 0).toString(16)}`);
                break;

            case Opcode.BRANCH:    // 0x63 B-type
                imm = ct.i32_u32((inst & 0x80000000) >> 19)
                    | ((inst & 0x80) << 4) // imm[11]
                    | ((inst >>> 20) & 0x7e0) // imm[10:5]
                    | ((inst >>> 7) & 0x1e); // imm[4:1]

                switch (funct3) {
                    case 0x0: // BEQ
                        if (this.debug) console.log(`dbg: exec: beq ${abi_name(rs1)}, ${abi_name(rs2)}, ${imm | 0}`);
                        if (this.u32regs[rs1] == this.u32regs[rs2]) {
                            this.pc = (this.pc + imm - 4) & 0xffff_ffff;
                            console.log(`dbg: brach: pc=#${this.pc.toString(16)}`);
                        }
                        return;
                    case 0x1: // BNE
                        if (this.debug) console.log(`dbg: exec: bne ${abi_name(rs1)}, ${abi_name(rs2)}, ${imm | 0}`);
                        if (this.u32regs[rs1] != this.u32regs[rs2]) {
                            this.pc = (this.pc + imm - 4) & 0xffff_ffff;
                            console.log(`dbg: brach: pc=#${this.pc.toString(16)}`);
                        }
                        return;
                    case 0x4: // BLT
                        if (this.debug) console.log(`dbg: exec: blt ${abi_name(rs1)}, ${abi_name(rs2)}, ${imm | 0}`);
                        if (this.i32regs[rs1] < this.i32regs[rs2]) {
                            this.pc = (this.pc + imm - 4) & 0xffff_ffff;
                            console.log(`dbg: brach: pc=#${this.pc.toString(16)}`);
                        }
                        return;
                    case 0x5: // BGE
                        if (this.debug) console.log(`dbg: exec: bge ${abi_name(rs1)}, ${abi_name(rs2)}, ${imm | 0}`);
                        if (this.i32regs[rs1] >= this.i32regs[rs2]) {
                            this.pc = (this.pc + imm - 4) & 0xffff_ffff;
                            console.log(`dbg: brach: pc=#${this.pc.toString(16)}`);
                        }
                        return;
                    case 0x6: // BLTU
                        if (this.debug) console.log(`dbg: exec: bltu ${abi_name(rs1)}, ${abi_name(rs2)}, ${imm | 0}`);
                        if (this.u32regs[rs1] < this.u32regs[rs2]) {
                            this.pc = (this.pc + imm - 4) & 0xffff_ffff;
                            console.log(`dbg: brach: pc=#${this.pc.toString(16)}`);
                        }
                        return;
                    case 0x7: // BGEU
                        if (this.debug) console.log(`dbg: exec: bgeu ${abi_name(rs1)}, ${abi_name(rs2)}, ${imm | 0}`);
                        if (this.u32regs[rs1] >= this.u32regs[rs2]) {
                            this.pc = (this.pc + imm - 4) & 0xffff_ffff;
                            console.log(`dbg: brach: pc=#${this.pc.toString(16)}`);
                        }
                        return;
                    default:
                        throw CpuException.IllegalInstruction;
                }

            case Opcode.JALR:      // 0x67 I-type
                let t = this.pc;

                offset = ct.i32_u32((inst & 0xfff00000) >> 20);
                let target = (this.u32regs[rs1] + offset) & 0xffff_fffe;

                this.pc = target;
                this.u32regs[rd] = t;

                if (this.debug) console.log(`dbg: exec: jalr ${abi_name(rd)}, ${abi_name(rs1)} + ${offset} // PC=#${this.pc.toString(16)} ${abi_name(rs1)}=#${this.u32regs[rd].toString(16)}`);
                break;

            case Opcode.JAL:       // 0x6f J-type
                offset = ct.i32_u32((inst & 0x80000000) >> 11) // imm[20]
                    | (inst & 0xff000) // imm[19:12]
                    | ((inst >>> 9) & 0x800) // imm[11]
                    | ((inst >>> 20) & 0x7fe); // imm[10:1]

                this.u32regs[rd] = this.pc
                this.pc = (this.pc + offset - 4) & 0xffff_ffff;

                if (this.debug) console.log(`dbg: exec: jal ${imm} // PC=#${this.pc.toString(16)}`);
                break;

            case Opcode.SYSTEM:    // 0x73
                const csr_addr = ((inst & 0xfff00000) >>> 20) as CSR;

                switch (funct3) {
                    case 0x0:
                        switch (true) {
                            case (rs2 == 0x0 && funct7 == 0x00): // ecall
                                if (this.debug) console.log(`dbg: exec: ecall`);
                                switch (this.mode) {
                                    case Mode.User:
                                        throw CpuException.EnvironmentCallFrom_UMode;
                                    case Mode.Supervisor:
                                        throw CpuException.EnvironmentCallFrom_SMode;
                                    case Mode.Machine:
                                        throw CpuException.EnvironmentCallFrom_MMode;
                                    default:
                                        throw CpuException.IllegalInstruction;
                                }

                            case (rs2 == 0x1 && funct7 == 0x00): // ebreak
                                if (this.debug) console.log(`dbg: exec: ebreak`);
                                throw CpuException.Breakpoint;
                            case (rs2 == 0x2 && funct7 == 0x00): // uret
                                if (this.debug) console.log(`dbg: exec: uret`);
                                console.log("uret: not implemented yet. pc: " + this.pc.toString(16));
                                break;
                            case (rs2 == 0x2 && funct7 == 0x08): // sret

                                this.Require(Mode.Supervisor);
                                this.pc = this.state.Rd32(CSR.SEPC);

                                switch (this.state.RdBit(CSR.SSTATUS, 8)) {
                                    case 0:
                                        this.mode = Mode.User;
                                        break;
                                    case 1:
                                        this.mode = Mode.Supervisor;
                                        break;
                                    default:
                                        this.mode = Mode.Debug;
                                }

                                this.state.WrBit(CSR.SSTATUS, 1, this.state.RdBit(CSR.SSTATUS, 5));
                                this.state.WrBit(CSR.SSTATUS, 5, 1);
                                this.state.WrBit(CSR.SSTATUS, 8, 0);

                                if (this.debug) console.log(`dbg: exec: sret`);
                                break;

                            case (rs2 == 0x2 && funct7 == 0x18): // mret

                                this.Require(Mode.Machine);
                                this.pc = this.state.Rd32(CSR.MEPC);

                                switch (this.state.RdBits(CSR.MSTATUS, 11, 2)) {
                                    case 0:
                                        this.mode = Mode.User;
                                        break;
                                    case 1:
                                        this.mode = Mode.Supervisor;
                                        break;
                                    case 3:
                                        this.mode = Mode.Machine;
                                        break;
                                    default:
                                        this.mode = Mode.Debug;
                                }

                                this.state.WrBit(CSR.MSTATUS, 3, this.state.RdBit(CSR.MSTATUS, 7))
                                this.state.WrBit(CSR.MSTATUS, 7, 1);
                                this.state.WrBits(CSR.MSTATUS, 11, 2, 0);

                                if (this.debug) console.log(`dbg: exec: mret`);
                                break;

                            case (rs2 == 0x5 && funct7 == 0x08): // wfi
                            case (funct7 == 0x09): // sfence.vma
                            case (funct7 == 0x11): // hfence.bvma
                            case (funct7 == 0x51): // hfence.gvma
                                if (this.debug) console.log(`dbg: exec: fence`);
                                break;

                            default:
                                throw CpuException.IllegalInstruction;
                        }
                    case 0x1: // CSRRW
                        t = this.state.Rd32(csr_addr);
                        this.state.Wr32(csr_addr, this.u32regs[rs1]);
                        this.u32regs[rd] = t;

                        if (csr_addr == CSR.SATP) {
                            this.UpdatePaging();
                        }

                        if (this.debug) console.log(`dbg: exec: csrrw ${abi_name(rd)}, ${CSR[csr_addr]}, ${abi_name(rs1)}`);
                        break;

                    case 0x2: // CSRRS
                        t = this.state.Rd32(csr_addr);
                        this.state.Wr32(csr_addr, t | this.u32regs[rs1]);
                        this.u32regs[rd] = t;

                        if (csr_addr == CSR.SATP) {
                            this.UpdatePaging();
                        }

                        if (this.debug) console.log(`dbg: exec: csrrs ${abi_name(rd)}, ${CSR[csr_addr]}, ${abi_name(rs1)}`);
                        break;

                    case 0x3: // CSRRC
                        t = this.state.Rd32(csr_addr);
                        this.state.Wr32(csr_addr, t & ~this.u32regs[rs1]);
                        this.u32regs[rd] = t;

                        if (csr_addr == CSR.SATP) {
                            this.UpdatePaging();
                        }

                        if (this.debug) console.log(`dbg: exec: csrrc ${abi_name(rd)}, ${CSR[csr_addr]}, ${abi_name(rs1)}`);
                        break;

                    case 0x5: // CSRRWI
                        this.u32regs[rd] = this.state.Rd32(csr_addr);
                        this.state.Wr32(csr_addr, rs1);

                        if (csr_addr == CSR.SATP) {
                            this.UpdatePaging();
                        }

                        if (this.debug) console.log(`dbg: exec: csrrwi ${abi_name(rd)}, ${CSR[csr_addr]}, ${rs1}`);
                        break;

                    case 0x6: // CSRRSI
                        t = this.state.Rd32(csr_addr);
                        this.state.Wr32(csr_addr, t | rs1);
                        this.u32regs[rd] = t;

                        if (csr_addr == CSR.SATP) {
                            this.UpdatePaging();
                        }

                        if (this.debug) console.log(`dbg: exec: csrrsi ${abi_name(rd)}, ${CSR[csr_addr]}, ${rs1}`);
                        break;

                    case 0x7: // CSRRCI
                        t = this.state.Rd32(csr_addr);
                        this.state.Wr32(csr_addr, t & ~rs1);
                        this.u32regs[rd] = t;

                        if (csr_addr == CSR.SATP) {
                            this.UpdatePaging();
                        }

                        if (this.debug) console.log(`dbg: exec: csrrci ${abi_name(rd)}, ${CSR[csr_addr]}, ${rs1}`);
                        break;

                    default:
                        throw CpuException.IllegalInstruction;
                }
            default:
                throw CpuException.IllegalInstruction;
        }
    }

    private UpdatePaging() {

    }

    private UpdateIrqPending(): Interrupt | false {

        switch (this.mode) {
            case Mode.Machine:
                if (this.state.RdBit(CSR.MSTATUS, 3) == 0) return false; // diable irq
                break;
            case Mode.Supervisor:
                if (this.state.RdBit(CSR.SSTATUS, 1) == 0) return false; // disable irq
                break;
        }

        // TODO запилить контроллер прервываний
        let irq = this.bus.GetActiveIRQ();

        if (irq != 0) {
            this.state.Set32(CSR.MIP, MIP.SEIP);
        }

        let pending = this.state.Rd32(CSR.MIE) & this.state.Rd32(CSR.MIP);
        if (this.debug) {
            console.log(`dbg: pending: ${pending.toString(16)}`);
        }


        if ((pending & MIP.MEIP) != 0) {
            this.state.Clr32(CSR.MIP, MIP.MEIP);
            return Interrupt.MachineExternalInterrupt;
        }

        if ((pending & MIP.MSIP) != 0) {
            this.state.Clr32(CSR.MIP, MIP.MSIP);
            return Interrupt.MachineSoftwareInterrupt;
        }

        if ((pending & MIP.MTIP) != 0) {
            this.state.Clr32(CSR.MIP, MIP.MTIP);
            return Interrupt.MachineTimerInterrupt;
        }

        if ((pending & MIP.SEIP) != 0) {
            this.state.Clr32(CSR.MIP, MIP.SEIP);
            return Interrupt.SupervisorExternalInterrupt;
        }

        if ((pending & MIP.SSIP) != 0) {
            this.state.Clr32(CSR.MIP, MIP.SSIP);
            return Interrupt.SupervisorSoftwareInterrupt;
        }

        if ((pending & MIP.STIP) != 0) {
            this.state.Clr32(CSR.MIDELEG, MIP.STIP);
            return Interrupt.SupervisorTimerInterrupt;
        }

        return false;
    }

    private PendingInterrupt(cause: Interrupt) {
        let exception_pc = this.pc;
        this.prev_mode = this.mode;

        if (this.mode <= Mode.Supervisor && this.state.RdBit(CSR.MIDELEG, cause) != 0) {
            this.mode = Mode.Supervisor;

            let vector = (this.state.RdBit(CSR.STVEC, 0) === 1) ? cause * 4 : 0;
            this.pc = (this.state.Rd32(CSR.STVEC) & 0xffff_fffe) + vector;

            this.state.Wr32(CSR.SEPC, exception_pc & 0xffff_fffe);
            this.state.Wr32(CSR.SCAUSE, (1 << 31) | cause);
            this.state.Wr32(CSR.STVAL, 0);
            this.state.WrBit(CSR.SSTATUS, 5, this.state.RdBit(CSR.SSTATUS, 1));
            this.state.WrBit(CSR.SSTATUS, 1, 0);

            this.state.WrBit(CSR.SSTATUS, 8, this.prev_mode == Mode.User ? 0 : 1);
        }
        else {
            this.mode = Mode.Machine;

            let vector = (this.state.RdBit(CSR.MTVEC, 0) === 1) ? cause * 4 : 0;
            this.pc = (this.state.Rd32(CSR.MTVEC) & 0xffff_fffe) + vector;

            this.state.Wr32(CSR.MEPC, exception_pc & 0xffff_fffe);
            this.state.Wr32(CSR.MCAUSE, (1 << 31) | cause);
            this.state.Wr32(CSR.MTVAL, 0);
            this.state.WrBit(CSR.MSTATUS, 7, this.state.RdBit(CSR.MSTATUS, 3));
            this.state.WrBit(CSR.MSTATUS, 3, 0);

            switch (this.prev_mode) {
                case Mode.User:
                case Mode.Supervisor:
                case Mode.Machine:
                    this.state.WrBits(CSR.MSTATUS, 11, 2, this.prev_mode);
                    break;
                default:
                    throw exception("previous privilege mode is invalid")
            }
        }
    }

    private TimerIncrement() {

    }

    private Trap(trap: CpuException) {

    }

    private Require(require: Mode): true {
        if (require <= this.mode)
            return true;

        throw CpuException.IllegalInstruction;
    }

    public DumpRegs(): void {

        const draw = (i: number) => `${abi_name(i)}=${("00000000" + this.u32regs[i].toString(16)).slice(-8)} `;

        console.log("PC: " + this.pc.toString(16))

        for (let i = 0; i < 32; i += 4) {
            console.log(draw(i) + draw(i + 1) + draw(i + 2) + draw(i + 3));
        }
        console.log('\n');
    }
}