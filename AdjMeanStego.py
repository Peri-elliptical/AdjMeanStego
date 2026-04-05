import numpy as np
import math
from flask import Flask, app, request, jsonify, render_template
from PIL import Image

app = Flask(__name__, template_folder='.')

def Embed_Image(Cover, Hide, Stego, N = 2):
    try:
        c_img = Image.open(Cover).convert('RGB')   
        c_array = np.array(c_img, dtype = np.uint16)
        c_width, c_height = c_img.size
        e_width, e_height = (c_width - 2) >> 1, c_height - 2
        h_img = Image.open(Hide).convert('RGB')
        h_array = np.array(h_img, dtype = np.uint8)
        h_width, h_height = h_img.size
        shift = (1 << (N - 1))
        sub = 8 - N
        for k in range(3):
            c_array[0][0][k] = (c_array[1][0][k] + c_array[0][1][k]) >> 1
        c_array[0][0][0] += N
        c_array[0][0][1] &= ~1
        if h_width > c_width - 2 and h_height > c_height - 2:
            raise ValueError("The image to be embedded is larger than the cover image.")
        elif h_width <= e_width and h_height <= e_height:
            for i in range(h_height):
                x_coord = i + 1
                for j in range(h_width):
                    y_coord = (j << 1) + 1 + (i & 1)
                    for k in range(3):
                        c_array[x_coord][y_coord][k] = ((c_array[x_coord - 1][y_coord][k] + c_array[x_coord + 1][y_coord][k] + c_array[x_coord][y_coord - 1][k] + c_array[x_coord][y_coord + 1][k]) >> 2) - shift
                        c_array[x_coord][y_coord][k] += h_array[i][j][k] >> sub
                        c_array[x_coord][y_coord][k] = np.clip(c_array[x_coord][y_coord][k], 0, 255)
                if y_coord < c_width - 3:
                    y_coord += 2
                    for k in range(3):
                        c_array[x_coord][y_coord][k] = ((c_array[x_coord - 1][y_coord][k] + c_array[x_coord + 1][y_coord][k] + c_array[x_coord][y_coord - 1][k] + c_array[x_coord][y_coord + 1][k]) >> 2) - shift
                        c_array[x_coord][y_coord][k] -= 1
                        if c_array[x_coord][y_coord][k] < 0:
                            c_array[x_coord][y_coord][k] = 0
            x_coord += 1
            y_coord = 2 if (y_coord & 1) else 1
            for k in range(3):
                c_array[x_coord][y_coord][k] = ((c_array[x_coord - 1][y_coord][k] + c_array[x_coord + 1][y_coord][k] + c_array[x_coord][y_coord - 1][k] + c_array[x_coord][y_coord + 1][k]) >> 2) - shift
                c_array[x_coord][y_coord][k] -= 1
                if c_array[x_coord][y_coord][k] < 0:
                    c_array[x_coord][y_coord][k] = 0
        else:
            c_array[0][0][1] |= 1
            for i in range(h_height):
                for j in range(h_width):
                    if (i + j) & 1 == 0:
                        for k in range(3):
                            i_inc = i + 1
                            j_inc = j + 1
                            c_array[i_inc][j_inc][k] = ((c_array[i_inc - 1][j_inc][k] + c_array[i_inc + 1][j_inc][k] + c_array[i_inc][j_inc - 1][k] + c_array[i_inc][j_inc + 1][k]) >> 2) - shift
                            c_array[i_inc ][j_inc][k] += h_array[i][j][k] >> sub
                            c_array[i_inc][j_inc][k] = np.clip(c_array[i_inc][j_inc][k], 0, 255)
                if j_inc < c_width - 3:
                    j_inc += 2
                    for k in range(3):
                        c_array[i_inc][j_inc][k] = ((c_array[i_inc - 1][j_inc][k] + c_array[i_inc + 1][j_inc][k] + c_array[i_inc][j_inc - 1][k] + c_array[i_inc][j_inc + 1][k]) >> 2) - shift
                        c_array[i_inc][j_inc][k] -= 1
                        if c_array[i_inc][j_inc][k] < 0:
                            c_array[i_inc][j_inc][k] = 0
            if i_inc < c_height - 2:
                i_inc += 1
                j_inc = 2 - (~j_inc & 1) 
                for k in range(3):
                    c_array[i_inc][j_inc][k] = ((c_array[i_inc - 1][j_inc][k] + c_array[i_inc + 1][j_inc][k] + c_array[i_inc][j_inc - 1][k] + c_array[i_inc][j_inc + 1][k]) >> 2) - shift
                    c_array[i_inc][j_inc][k] -= 1
                    if c_array[i_inc][j_inc][k] < 0:
                        c_array[i_inc][j_inc][k] = 0
        array = c_array.astype(np.uint8)
        img = Image.fromarray(array)
        img.show()
        img.save(Stego)
    except FileNotFoundError:
        print("\nError! The image was not found. Please check the path and try again.\n")
    except Exception as e:
        print(f"\nError! {e}\n")

def Extract_Image(Stego, Cover, Hidden):
    try:
        s_img = Image.open(Stego).convert('RGB')   
        s_array = np.array(s_img, dtype = np.uint8)
        s_width, s_height = s_img.size
        N = s_array[0][0][0] - math.ceil((s_array[0][1][0] + s_array[1][0][0]) / 2)
        shift = (1 << (N - 1))
        adjust = 8 - N
        flag2 = False
        c_array = [[]]
        if s_array[0][0][1] & 1:
            for i in range(1, s_height - 1):
                flag1 = False
                for j in range(1, s_width - 1):
                    if (i + j) & 1 == 0:
                        arr = []
                        for k in range(3):
                            avg = math.ceil(np.mean([s_array[i-1][j][k], s_array[i+1][j][k], s_array[i][j-1][k], s_array[i][j+1][k]]))
                            val = s_array[i][j][k] - avg + shift
                            if val == (-1):
                                flag1 = True
                                if j < 3:
                                    flag2 = True
                                s_array[i][j][k] = avg
                                break
                            else:
                                arr.append(val << adjust)
                            s_array[i][j][k] = avg
                        if flag1:
                            break
                        else:
                            c_array[(-1)].append(arr)
                    elif (i + j) & 1 and j < s_height - 5 - (s_height & 1):
                        c_array[(-1)].append([0, 0, 0])
                if flag2:
                    s_array[i][j][k] = avg
                    break
                else:
                    c_array.append([])
            c_array.pop()
            for i in range(len(c_array)):
                for j in range(len(c_array[i])):
                    if (i + j) & 1:
                        for k in range(3):
                            avg_mem = []
                            if i != 0:
                                avg_mem.append(c_array[i - 1][j][k])
                            if j != 0:
                                avg_mem.append(c_array[i][j - 1][k])
                            if i != len(c_array) - 1:
                                avg_mem.append(c_array[i + 1][j][k])
                            if j != len(c_array[i]) - 1:
                                avg_mem.append(c_array[i][j + 1][k])
                            c_array[i][j][k] = int(np.mean(avg_mem))
        else:
            for i in range(1, s_width - 1):
                flag1 = False
                for j in range(1, s_height - 1):
                    if (i + j) & 1 == 0:
                        arr = []
                        for k in range(3):
                            avg = math.ceil(np.mean([s_array[i-1][j][k], s_array[i+1][j][k], s_array[i][j-1][k], s_array[i][j+1][k]]))
                            val = s_array[i][j][k] - avg + shift
                            if val == (-1):
                                flag1 = True
                                if j < 3:
                                    flag2 = True
                                s_array[i][j][k] = avg
                                break
                            else:
                                arr.append(val << adjust)
                            s_array[i][j][k] = avg
                        if flag1:
                            break
                        else:
                            c_array[(-1)].append(arr)
                if flag2:
                    s_array[i][j][k] = avg
                    break
                else:
                    c_array.append([])
            c_array.pop()
        c_array = np.array(c_array, dtype = np.uint8)
        img = Image.fromarray(c_array)
        img.show()
        img.save(Cover)
        img = Image.fromarray(s_array)
        img.show()
        img.save(Hidden)
    except FileNotFoundError:
        print("\nError! The image was not found. Please check the path and try again.\n")
    except Exception as e:
        print(f"\nError! {e}\n")

def EmbPixels(x, y):
    x -= 2
    y -= 2
    if x < 0 or y < 0:
        return 0
    return (x * y + (x & 1) * (y & 1)) >> 1

def Embed_Text(Cover, Embed, Stego, N = 2, Wrap = True):
    try:
        img = Image.open(Cover).convert('RGB')   
        array = np.array(img, dtype = np.int16)
        width, height = img.size
        num_pix = EmbPixels(height, width)
        with open(Embed, "r") as f:
            txt = f.read()
        if N <= 0:
            N = len(txt) * 7 // (num_pix * 3) + (0 if len(txt) * 7 % num_pix else 1)
            if Wrap and N == 1:
                N = 2
        elif N > 7:
            raise ValueError("The embedding depth must be a positive integer less than eight.")
        elif len(txt) * 7 > num_pix * N * 3:
            raise ValueError("Overflow! The text to be embedded is larger than the image capacity.\nChoose a larger embedding depth or an image with a higher resolution.")
        msg = ""
        for i in txt:
            if ord(i) > 127:
                raise ValueError("The character set is not ASCII.")
            msg += bin(ord(i))[2:].zfill(7)
        r = N - len(msg) % N
        r = 0 if r == N else r
        if Wrap:
            msg *= N // math.gcd(N, r)
            r = len(msg) % 7
        else:
            msg += "0" * r
        L = [msg[i:i+N] for i in range(0, len(msg), N)]
        for k in range(3):
            array[0][0][k] = (array[1][0][k] + array[0][1][k]) // 2
        array[0][0][0] += N
        array[0][0][1] += r
        shift = (1 << (N - 1))
        index = 0
        flag = 0
        for i in range(1, height - 1):
            for j in range(1, width - 1):
                if (i + j) & 1 == 0:
                    for k in range(3):
                        array[i][j][k] = (array[i - 1][j][k] + array[i + 1][j][k] + array[i][j - 1][k] + array[i][j + 1][k]) // 4 - shift
                        if index < len(L):
                            array[i][j][k] += int(L[index], 2)
                            if Wrap:
                                index = (index + 1) % len(L)
                            else:
                                index += 1
                        else:
                            array[i][j][k] -= 1
                            flag = 1
                        if array[i][j][k] > 255:
                            array[i][j][k] = 255
                        elif array[i][j][k] < 0:
                            array[i][j][k] = 0
                if flag:
                    break
            if flag:
                break
        array = array.astype(np.uint8)
        img = Image.fromarray(array)
        img.show()
        img.save(Stego)
    except FileNotFoundError:
        print("\nError! The image was not found. Please check the path and try again.\n")
    except Exception as e:
        print(f"\nError! {e}\n")

def Extract_Text(Stego, Cover, Text):
    try:
        img = Image.open(Stego).convert('RGB')   
        array = np.array(img, dtype=np.int16)
        width, height = img.size
        N = array[0][0][0] - math.ceil((array[0][1][0] + array[1][0][0]) / 2)
        r = array[0][0][1] - math.ceil((array[0][1][1] + array[1][0][1]) / 2)
        msg = ""
        shift = 1 << (N - 1)
        flag = 0
        for i in range(1, height - 1):
            for j in range(1, width - 1):
                if (i + j) % 2 == 0:
                    for k in range(3):
                        cell = math.ceil((array[i-1][j][k] + array[i+1][j][k] + array[i][j-1][k] + array[i][j+1][k]) / 4)
                        val = array[i][j][k] - cell + shift
                        array[i][j][k] = cell
                        if val == (-1):
                            flag = 1
                            break
                        msg += bin(val)[2:].zfill(N)
                if flag:
                    break
            if flag:
                break
        array = array.astype(np.uint8)
        img = Image.fromarray(array)
        img.show()
        img.save(Cover)
        if r:
            msg = msg[:-r]
        L = [msg[i:i+7] for i in range(0, len(msg), 7)]
        if len(L[-1]) < 7:
            L.pop()
        with open(Text, "w") as file:
            for i in L:
                file.write(chr(int(i, 2)))
    except FileNotFoundError:
        print("\nError! The image was not found. Please check the path and try again.\n")
    except Exception as e:
        print(f"\nError! {e}\n")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/embed', methods=['POST'])
def embed():
    return jsonify({"status": "success"})

@app.route('/extract', methods=['POST'])
def extract():
    return jsonify({"status": "success"})