#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>

EMSCRIPTEN_KEEPALIVE
uint8_t* create_buffer(int width, int height) {
    return malloc(width * height * 4); // 4 bytes per pixel (RGBA)
}

EMSCRIPTEN_KEEPALIVE
void process_stego(uint8_t* img_data, int width, int height, const char* message, int msg_len) {
    // C modifies img_data directly in place
}