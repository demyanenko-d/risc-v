
const convbuff = new ArrayBuffer(8);
const u8buf = new Uint8Array(convbuff);
const i8buf = new Int8Array(convbuff);
const u16buf = new Uint16Array(convbuff);
const i16buf = new Int16Array(convbuff);
const u32buf = new Uint32Array(convbuff);
const i32buf = new Int32Array(convbuff);

export function u8_i8(arg: number): number {
    if (arg < 0) return NaN;

    u8buf[0] = arg;
    return i8buf[0];
}

export function u16_i16(arg: number): number {
    if (arg < 0) return NaN;

    u16buf[0] = arg;
    return i16buf[0];
}

export function u32_i32(arg: number): number {
    if (arg < 0) return NaN;

    u32buf[0] = arg;
    return i32buf[0];
}

export function i8_u8(arg: number): number {
    i8buf[0] = arg;
    return u8buf[0];
}

export function i16_u16(arg: number): number {
    i16buf[0] = arg;
    return u16buf[0];
}

export function i32_u32(arg: number): number {
    i32buf[0] = arg;
    return u32buf[0];
}

export function i8_u32(arg: number): number {
    i32buf[0] = arg >= 0 ? u8_i8(arg) : arg;
    return u32buf[0];
}

export function i16_u32(arg: number): number {
    i32buf[0] = arg >= 0 ? u16_i16(arg) : arg;
    return u32buf[0];
}


function test_u8_i8(arg: number) {
    const res = u8_i8(arg);
    const res1 = i8_u8(res);
    const res2 = i8_u32(res);
    console.log(`u8: ${arg} : ${arg.toString(16)}  >>>  i8(dec): ${res} : ${res2.toString(16)} >>>  u8: ${res1} : ${res1.toString(16)}`);
}

function test_u16_i16(arg: number) {
    const res = u16_i16(arg);
    const res1 = i16_u16(res);
    const res2 = i16_u32(res);
    console.log(`u16: ${arg} : ${arg.toString(16)}  >>>  i16(dec): ${res} : ${res2.toString(16)}  >>>  u16: ${res1} : ${res1.toString(16)}`);
}

function test_u32_i32(arg: number) {
    const res = u32_i32(arg);
    const res1 = i32_u32(res);
    console.log(`u32: ${arg} : ${arg.toString(16)}  >>>  i32(dec): ${res}  >>>  u16: ${res1} : ${res1.toString(16)}`);
}

export function test() {

    console.log("u8->i8")
    test_u8_i8(0);
    test_u8_i8(1);
    test_u8_i8(2);
    test_u8_i8(127);
    test_u8_i8(128);
    test_u8_i8(254);
    test_u8_i8(255);
    test_u8_i8(256);

    console.log("u16->i16")
    test_u16_i16(0);
    test_u16_i16(1);
    test_u16_i16(2);
    test_u16_i16(32767);
    test_u16_i16(32768);
    test_u16_i16(65534);
    test_u16_i16(65535);
    test_u16_i16(65536);

    console.log("u32->i32")
    test_u32_i32(0);
    test_u32_i32(1);
    test_u32_i32(2);
    test_u32_i32(2147483647);
    test_u32_i32(2147483648);
    test_u32_i32(4294967294);
    test_u32_i32(4294967295);
    test_u32_i32(4294967296);
}