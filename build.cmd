riscv64-unknown-elf-c++.exe .\crt0.S .\main.cpp -O3 -march=rv32i -mabi=ilp32 -nostartfiles
objdump -d .\a.out > a.lst