import { exception } from "console";
import * as fs from "fs";
import { off } from "process";

export enum EI_CLASS {
    ELFCLASSNONE = 0,
    ELFCLASS32 = 1,
    ELFCLASS64 = 2,
}

export enum EI_DATA {
    ELFDATANONE = 0,
    ELFDATA2LSB = 1,
    ELFDATA2MSB = 2,
}

export enum E_TYPE {
    ET_NONE = 0,
    ET_REL = 1,
    ET_EXEC = 2,
    ET_DYN = 3,
    ET_CORE = 4,
}

export enum P_TYPE {
    PT_NULL = 0,
    PT_LOAD = 1,
    PT_DYNAMIC = 2,
    PT_INTERP = 3,
    PT_NOTE = 4,
    PT_SHLIB = 5,
    PT_PHDR = 6,
    PT_TLS = 7,
}

export class ElfSegment {
    public p_type: P_TYPE;
    public p_offset: number;
    public p_vaddr: number;
    public p_paddr: number;
    public p_filesz: number;
    public p_memsz: number;
    public p_flags: number;
    public p_align: number;

    public toString = (): string => {
        let flags = "";
        if ((this.p_flags & 0x01) != 0)
            flags += "X ";

        if ((this.p_flags & 0x02) != 0)
            flags += "W ";

        if ((this.p_flags & 0x04) != 0)
            flags += "R ";

        let res = `
        [[PROGRAM SECTION]]
        p_type          : ${P_TYPE[this.p_type]}
        p_offset        : ${this.p_offset}
        p_vaddr         : ${this.p_vaddr.toString(16)}
        p_paddr         : ${this.p_paddr.toString(16)}
        p_filesz        : ${this.p_filesz}
        p_memsz         : ${this.p_memsz}
        p_flags         : ${this.p_flags.toString(16)} (${flags.trim()})
        p_align         : ${this.p_align}
        `;

        return res;
    }
}

export class ElfFile {
    public readonly fname: string;
    public readonly buffer: Buffer;

    // ident
    public ei_class: EI_CLASS;
    public ei_data: EI_DATA;
    public ei_vesion: number;
    public ei_osabi: number;
    public ei_abiversion: number;

    // header
    public e_type: E_TYPE;
    public e_machine: number;
    public e_version: number;
    public e_entry: number;
    public e_phoff: number;
    public e_shoff: number;
    public e_flags: number;
    public e_ehsize: number;
    public e_phentsize: number;
    public e_phnum: number;
    public e_shentsize: number;
    public e_shnum: number;
    public e_shstrndx: number;

    public prg_sections: ElfSegment[];

    public constructor(fname: string) {
        this.fname = fname;
        this.buffer = fs.readFileSync(fname);

        this.prg_sections = new Array<ElfSegment>();
    }

    public parse(): void {
        const magic = this.buffer.readInt32BE(0);
        if (magic != 0x7f454c46) throw new exception("invalid efl file");

        this.ei_class = this.buffer.readUInt8(4) as EI_CLASS;
        this.ei_data = this.buffer.readUInt8(5) as EI_DATA;
        this.ei_vesion = this.buffer.readUInt8(6);
        this.ei_osabi = this.buffer.readUInt8(7);
        this.ei_abiversion = this.buffer.readUInt8(8);

        this.e_type = this.buffer.readUInt16LE(16) as E_TYPE;
        this.e_machine = this.buffer.readUInt16LE(18);
        this.e_version = this.buffer.readUInt32LE(20);
        this.e_entry = this.buffer.readUInt32LE(24);
        this.e_phoff = this.buffer.readUInt32LE(28);
        this.e_shoff = this.buffer.readUInt32LE(32);
        this.e_flags = this.buffer.readUInt32LE(36);
        this.e_ehsize = this.buffer.readUInt16LE(40);
        this.e_phentsize = this.buffer.readUInt16LE(42);
        this.e_phnum = this.buffer.readUInt16LE(44);
        this.e_shentsize = this.buffer.readUInt16LE(46);
        this.e_shnum = this.buffer.readUInt16LE(48);
        this.e_shstrndx = this.buffer.readUInt16LE(50);

        if (this.e_phoff != 0)
            this.ReadProgramHeaders();
    }

    public LoadSegment(segment: ElfSegment, memory: Uint8Array, offset: number) {
        for(let i=0; i < segment.p_filesz; i++) {
            memory[offset + i] = this.buffer[segment.p_offset + i];
        }
    }

    private ReadProgramHeaders() {
        const ReadPSection = (offset: number): ElfSegment => {
            let res = new ElfSegment();

            res.p_type = this.buffer.readUInt32LE(offset) as P_TYPE;
            res.p_offset = this.buffer.readUInt32LE(offset + 4);
            res.p_vaddr = this.buffer.readUInt32LE(offset + 8);
            res.p_paddr = this.buffer.readUInt32LE(offset + 12);
            res.p_filesz = this.buffer.readUInt32LE(offset + 16);
            res.p_memsz = this.buffer.readUInt32LE(offset + 20);

            res.p_flags = this.buffer.readUInt32LE(offset + 24);
            res.p_align = this.buffer.readUInt32LE(offset + 28);

            return res;
        }

        for(let i=0 ; i < this.e_phnum; i ++) {
            let section = ReadPSection(this.e_phoff + i*32);
            this.prg_sections.push(section);
        }
    }

    public toString = (): string => {
        let res = "";
        res += `
        filename        : ${this.fname} 
        file size       : ${this.buffer.length}

        [[EFI IDENTIFER]]
        ei_class        : ${EI_CLASS[this.ei_class]}
        ei_data         : ${EI_DATA[this.ei_data]}
        ei_version      : ${this.ei_vesion}
        ei_osabi        : ${this.ei_osabi}
        ei_abiversion   : ${this.ei_abiversion}

        [[EFI HEADER]]
        e_type          : ${E_TYPE[this.e_type]}
        e_machine       : ${this.e_machine}
        e_version       : ${this.e_version}
        e_entry         : 0x${this.e_entry.toString(16)}
        e_phoff         : ${this.e_phoff}
        e_shoff         : ${this.e_shoff}
        e_flags         : ${this.e_flags}
        e_ehsize        : ${this.e_ehsize}
        e_phentsize     : ${this.e_phentsize}
        e_phnum         : ${this.e_phnum}
        e_shentsize     : ${this.e_shentsize}
        e_shnum         : ${this.e_shnum}
        e_shstrndx      : ${this.e_shstrndx}
        `;

        for(let i=0 ; i < this.e_phnum; i ++)
            res += this.prg_sections[i].toString();

        return res;
    }
}
