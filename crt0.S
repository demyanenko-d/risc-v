.section .init, "ax"
.global _start
.global arg_a
.global arg_b

_start:
    .option push
    .option norelax
    la      gp, __global_pointer$
    .option pop
    la      sp, 0x10000
    add     s0, sp, zero
    call    main
    j       _end

arg_a:
    .word   3
arg_b:
    .word   70

_end:
    j   _end    



//main:
//    j   main