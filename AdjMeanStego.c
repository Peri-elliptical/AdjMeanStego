#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>

EMSCRIPTEN_KEEPALIVE
uint8_t* create_buffer(int width, int height) {
    return malloc(width * height * 4); // 4 bytes per pixel (RGBA)
}

EMSCRIPTEN_KEEPALIVE
void process_stego(uint8_t* img_data, int width, int height) {
    // Your logic: Loop through img_data and apply steganography
}