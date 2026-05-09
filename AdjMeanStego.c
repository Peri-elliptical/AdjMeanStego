#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>

EMSCRIPTEN_KEEPALIVE
uint8_t* create_buffer(int width, int height) {
    return malloc(width * height * 4); // 4 bytes per pixel (RGBA)
}

EMSCRIPTEN_KEEPALIVE
void process_stego(uint8_t* img_data, int width, int height, const char* message, int msg_len, int emb_depth) {
    if (msg_len > 0) {
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int index = (y * width + x) * 4; // 4 bytes per pixel (RGBA)
                img_data[index]     = 0; // Red
                //img_data[index + 1] = 0;   // Green
                //img_data[index + 2] = 0;   // Blue
                //img_data[index + 3] = 255; // Alpha
            }
        }
    }
}