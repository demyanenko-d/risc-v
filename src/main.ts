import * as ct from "./ctypes"
import * as elf from "./elf"
import { Machine } from "./Machine";

//ct.test();

console.log(ct.i32_u32(ct.u32_i32(-30 >>> 0) >> 1))

const machine = new Machine();
machine.cpu.debug = true;

const efile = new elf.ElfFile("a.out");
efile.parse();

const section = efile.prg_sections[0];
efile.LoadSegment(section, machine.memory.u8memory, section.p_vaddr);

console.log(efile.toString());

machine.cpu.Reset(efile.e_entry);



for (let tact = 0; tact < 40; tact++) {
    machine.cpu.Exec();
}

machine.cpu.DumpRegs();


