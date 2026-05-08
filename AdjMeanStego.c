#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>

EMSCRIPTEN_KEEPALIVE
uint8_t* create_buffer(int width, int height) {
    return malloc(width * height * 4); // 4 bytes per pixel (RGBA)
}

EMSCRIPTEN_KEEPALIVE
void process_stego(uint8_t* img_data, int width, int height, const char* message, int msg_len) {
    // If the user typed a message, draw a 50x50 red square in the top-left corner
    if (msg_len > 0) {
        for (int y = 0; y < 100; y++) {
            for (int x = 0; x < 50; x++) {
                // Ensure we don't draw outside the image if it's smaller than 50x50
                if (x < width && y < height) {
                    int index = (y * width + x) * 4; // 4 bytes per pixel (RGBA)
                    img_data[index]     = 255; // Red
                    img_data[index + 1] = 0;   // Green
                    img_data[index + 2] = 0;   // Blue
                    img_data[index + 3] = 255; // Alpha
                }
            }
        }
    }
}