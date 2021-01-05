#include <cstdint>

extern uint32_t arg_a, arg_b;

uint32_t mul(uint32_t a, uint32_t b) {
    return a * b;
}

int main() {
    return mul(arg_b, arg_a);
}