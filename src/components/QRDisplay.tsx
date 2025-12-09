/*
 * Copyright (c) 2025, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
import { Canvas, Rect, RoundedRect } from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";

interface QRDisplayProps {
    data: string;
    size?: number;
    backgroundColor?: string;
    foregroundColor?: string;
}

interface QRModule {
    x: number;
    y: number;
    width: number;
    height: number;
}

class QRCodeGenerator {
    private static readonly ERROR_CORRECT_LEVEL = 1;
    private static readonly MODE_NUMBER = 1;
    private static readonly MODE_ALPHA_NUM = 2;
    public static readonly MODE_8BIT_BYTE = 4;

    private modules: boolean[][] = [];
    private moduleCount = 0;
    private errorCorrectLevel: number;
    private dataList: QRData[] = [];

    constructor(
        errorCorrectLevel: number = QRCodeGenerator.ERROR_CORRECT_LEVEL,
    ) {
        this.errorCorrectLevel = errorCorrectLevel;
    }

    addData(data: string) {
        const newData = new QR8bitByte(data);
        this.dataList.push(newData);
    }

    make() {
        this.makeImpl(false, this.getBestMaskPattern());
    }

    private makeImpl(test: boolean, maskPattern: number) {
        this.moduleCount = this.getModuleCount();
        this.modules = Array(this.moduleCount)
            .fill(null)
            .map(() => Array(this.moduleCount).fill(null));

        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);

        if (this.getTypeNumber() >= 7) {
            this.setupTypeNumber(test);
        }

        this.mapData(this.createData(), maskPattern);
    }
    private setupTypeNumber(test: boolean) {
        const bits = this.getBCHTypeNumber(this.getTypeNumber());

        for (let i = 0; i < 18; i++) {
            const mod = !test && ((bits >> i) & 1) === 1;
            this.modules[Math.floor(i / 3)][
                (i % 3) + this.moduleCount - 8 - 3
            ] = mod;
        }

        for (let i = 0; i < 18; i++) {
            const mod = !test && ((bits >> i) & 1) === 1;
            this.modules[(i % 3) + this.moduleCount - 8 - 3][
                Math.floor(i / 3)
            ] = mod;
        }
    }

    private getBCHTypeNumber(data: number): number {
        let d = data << 12;
        while (this.getBCHDigit(d) - this.getBCHDigit(0x1f25) >= 0) {
            d ^= 0x1f25 << (this.getBCHDigit(d) - this.getBCHDigit(0x1f25));
        }
        return (data << 12) | d;
    }

    public getModuleCount(): number {
        return this.getTypeNumber() * 4 + 17;
    }

    private getTypeNumber(): number {
        const totalDataCount = this.dataList.reduce(
            (acc, data) => acc + data.getLength(),
            0,
        );

        // Data capacity for each version at different error correction levels
        // [L, M, Q, H] - where L=1, M=0, Q=3, H=2
        const capacities = [
            [17, 14, 11, 7], // Version 1
            [32, 26, 20, 14], // Version 2
            [53, 42, 32, 24], // Version 3
            [78, 62, 46, 34], // Version 4
            [106, 84, 60, 44], // Version 5
            [134, 106, 74, 58], // Version 6
            [154, 122, 86, 64], // Version 7
            [192, 152, 108, 84], // Version 8
            [230, 180, 130, 98], // Version 9
            [271, 213, 151, 119], // Version 10
        ];

        for (let version = 1; version <= capacities.length; version++) {
            const levelIndex =
                this.errorCorrectLevel === 1
                    ? 0
                    : this.errorCorrectLevel === 0
                      ? 1
                      : this.errorCorrectLevel === 3
                        ? 2
                        : 3;
            const capacity = capacities[version - 1][levelIndex];
            if (totalDataCount <= capacity) {
                return version;
            }
        }

        throw new Error(
            `Data too long for QR Code: ${totalDataCount} characters (max supported: version 10)`,
        );
    }

    private setupPositionProbePattern(row: number, col: number) {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                if (
                    row + r <= -1 ||
                    this.moduleCount <= row + r ||
                    col + c <= -1 ||
                    this.moduleCount <= col + c
                ) {
                    continue;
                }

                if (
                    (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
                    (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
                    (2 <= r && r <= 4 && 2 <= c && c <= 4)
                ) {
                    this.modules[row + r][col + c] = true;
                } else {
                    this.modules[row + r][col + c] = false;
                }
            }
        }
    }

    private setupTimingPattern() {
        for (let r = 8; r < this.moduleCount - 8; r++) {
            if (this.modules[r][6] === null) {
                this.modules[r][6] = r % 2 === 0;
            }
        }

        for (let c = 8; c < this.moduleCount - 8; c++) {
            if (this.modules[6][c] === null) {
                this.modules[6][c] = c % 2 === 0;
            }
        }
    }

    private setupPositionAdjustPattern() {
        const pos = this.getPatternPosition();
        for (let i = 0; i < pos.length; i++) {
            for (let j = 0; j < pos.length; j++) {
                const row = pos[i];
                const col = pos[j];

                if (this.modules[row][col] !== null) continue;

                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        if (
                            r === -2 ||
                            r === 2 ||
                            c === -2 ||
                            c === 2 ||
                            (r === 0 && c === 0)
                        ) {
                            this.modules[row + r][col + c] = true;
                        } else {
                            this.modules[row + r][col + c] = false;
                        }
                    }
                }
            }
        }
    }

    private getPatternPosition(): number[] {
        const typeNumber = this.getTypeNumber();
        const positions = [
            [], // Version 1 - no alignment patterns
            [6, 18], // Version 2
            [6, 22], // Version 3
            [6, 26], // Version 4
            [6, 30], // Version 5
            [6, 34], // Version 6
            [6, 22, 38], // Version 7
            [6, 24, 42], // Version 8
            [6, 26, 46], // Version 9
            [6, 28, 50], // Version 10
        ];
        return positions[typeNumber - 1] || [];
    }

    private setupTypeInfo(test: boolean, maskPattern: number) {
        const data = (this.errorCorrectLevel << 3) | maskPattern;
        const bits = this.getBCHTypeInfo(data);

        for (let i = 0; i < 15; i++) {
            const mod = !test && ((bits >> i) & 1) === 1;

            if (i < 6) {
                this.modules[i][8] = mod;
            } else if (i < 8) {
                this.modules[i + 1][8] = mod;
            } else {
                this.modules[this.moduleCount - 15 + i][8] = mod;
            }
        }

        for (let i = 0; i < 15; i++) {
            const mod = !test && ((bits >> i) & 1) === 1;

            if (i < 8) {
                this.modules[8][this.moduleCount - i - 1] = mod;
            } else if (i < 9) {
                this.modules[8][15 - i - 1 + 1] = mod;
            } else {
                this.modules[8][15 - i - 1] = mod;
            }
        }

        this.modules[this.moduleCount - 8][8] = !test;
    }

    private getBCHTypeInfo(data: number): number {
        let d = data << 10;
        while (this.getBCHDigit(d) - this.getBCHDigit(0x537) >= 0) {
            d ^= 0x537 << (this.getBCHDigit(d) - this.getBCHDigit(0x537));
        }
        return ((data << 10) | d) ^ 0x5412;
    }

    private getBCHDigit(data: number): number {
        let digit = 0;
        while (data !== 0) {
            digit++;
            data >>>= 1;
        }
        return digit;
    }

    private mapData(data: number[], maskPattern: number) {
        let inc = -1;
        let row = this.moduleCount - 1;
        let bitIndex = 7;
        let byteIndex = 0;

        for (let col = this.moduleCount - 1; col > 0; col -= 2) {
            if (col === 6) col--;

            while (true) {
                for (let c = 0; c < 2; c++) {
                    if (this.modules[row][col - c] === null) {
                        let dark = false;

                        if (byteIndex < data.length) {
                            dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
                        }

                        const mask = this.getMask(maskPattern, row, col - c);

                        if (mask) {
                            dark = !dark;
                        }

                        this.modules[row][col - c] = dark;
                        bitIndex--;

                        if (bitIndex === -1) {
                            byteIndex++;
                            bitIndex = 7;
                        }
                    }
                }

                row += inc;

                if (row < 0 || this.moduleCount <= row) {
                    row -= inc;
                    inc = -inc;
                    break;
                }
            }
        }
    }

    private getMask(maskPattern: number, i: number, j: number): boolean {
        switch (maskPattern) {
            case 0:
                return (i + j) % 2 === 0;
            case 1:
                return i % 2 === 0;
            case 2:
                return j % 3 === 0;
            case 3:
                return (i + j) % 3 === 0;
            case 4:
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
            case 5:
                return ((i * j) % 2) + ((i * j) % 3) === 0;
            case 6:
                return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
            case 7:
                return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
            default:
                return false;
        }
    }

    private getBestMaskPattern(): number {
        let minLostPoint = 0;
        let pattern = 0;

        for (let i = 0; i < 8; i++) {
            this.makeImpl(true, i);
            const lostPoint = this.getLostPoint();

            if (i === 0 || minLostPoint > lostPoint) {
                minLostPoint = lostPoint;
                pattern = i;
            }
        }

        return pattern;
    }

    private getLostPoint(): number {
        let lostPoint = 0;

        for (let row = 0; row < this.moduleCount; row++) {
            for (let col = 0; col < this.moduleCount; col++) {
                let sameCount = 0;
                const dark = this.modules[row][col];

                for (let r = -1; r <= 1; r++) {
                    if (row + r < 0 || this.moduleCount <= row + r) continue;

                    for (let c = -1; c <= 1; c++) {
                        if (col + c < 0 || this.moduleCount <= col + c)
                            continue;
                        if (r === 0 && c === 0) continue;

                        if (dark === this.modules[row + r][col + c]) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += 3 + sameCount - 5;
                }
            }
        }

        return lostPoint;
    }

    private createData(): number[] {
        const buffer = new QRBitBuffer();

        for (const data of this.dataList) {
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), this.getLengthInBits(data.mode));
            data.write(buffer);
        }

        const totalDataCount = this.getTotalDataCount();
        if (buffer.getLengthInBits() > totalDataCount * 8) {
            throw new Error("Code length overflow");
        }

        if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
            buffer.put(0, 4);
        }

        while (buffer.getLengthInBits() % 8 !== 0) {
            buffer.putBit(false);
        }

        while (true) {
            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(0xec, 8);

            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(0x11, 8);
        }

        return this.createBytes(buffer);
    }

    private createBytes(buffer: QRBitBuffer): number[] {
        let offset = 0;
        let maxDcCount = 0;
        let maxEcCount = 0;

        const dcdata: number[][] = [];
        const ecdata: number[][] = [];

        const rsBlocks = this.getRSBlocks();

        for (let r = 0; r < rsBlocks.length; r++) {
            const dcCount = rsBlocks[r].dataCount;
            const ecCount = rsBlocks[r].totalCount - dcCount;

            maxDcCount = Math.max(maxDcCount, dcCount);
            maxEcCount = Math.max(maxEcCount, ecCount);

            dcdata[r] = Array(dcCount);

            for (let i = 0; i < dcdata[r].length; i++) {
                dcdata[r][i] = 0xff & buffer.buffer[i + offset];
            }
            offset += dcCount;

            const rsPoly = this.getErrorCorrectPolynomial(ecCount);
            const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

            const modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = Array(rsPoly.getLength() - 1);
            for (let i = 0; i < ecdata[r].length; i++) {
                const modIndex = i + modPoly.getLength() - ecdata[r].length;
                ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
            }
        }

        let totalCodeCount = 0;
        for (let i = 0; i < rsBlocks.length; i++) {
            totalCodeCount += rsBlocks[i].totalCount;
        }

        const data = Array(totalCodeCount);
        let index = 0;

        for (let i = 0; i < maxDcCount; i++) {
            for (let r = 0; r < rsBlocks.length; r++) {
                if (i < dcdata[r].length) {
                    data[index++] = dcdata[r][i];
                }
            }
        }

        for (let i = 0; i < maxEcCount; i++) {
            for (let r = 0; r < rsBlocks.length; r++) {
                if (i < ecdata[r].length) {
                    data[index++] = ecdata[r][i];
                }
            }
        }

        return data;
    }

    private getRSBlocks(): RSBlock[] {
        const rsBlock = this.getRsBlockTable(
            this.getTypeNumber(),
            this.errorCorrectLevel,
        );

        const list: RSBlock[] = [];

        // Handle both 3-element and 6-element arrays
        for (let i = 0; i < rsBlock.length; i += 3) {
            const count = rsBlock[i];
            const totalCount = rsBlock[i + 1];
            const dataCount = rsBlock[i + 2];

            for (let j = 0; j < count; j++) {
                list.push(new RSBlock(totalCount, dataCount));
            }
        }

        return list;
    }

    private getRsBlockTable(
        typeNumber: number,
        errorCorrectLevel: number,
    ): number[] {
        const rsBlockTable: { [key: string]: number[] } = {
            // Version 1
            "1-1": [1, 26, 19], // L
            "1-0": [1, 26, 16], // M
            "1-3": [1, 26, 13], // Q
            "1-2": [1, 26, 9], // H

            // Version 2
            "2-1": [1, 44, 34],
            "2-0": [1, 44, 28],
            "2-3": [1, 44, 22],
            "2-2": [1, 44, 16],

            // Version 3
            "3-1": [1, 70, 55],
            "3-0": [1, 70, 44],
            "3-3": [2, 35, 17],
            "3-2": [2, 35, 13],

            // Version 4
            "4-1": [1, 100, 80],
            "4-0": [2, 50, 32],
            "4-3": [2, 50, 24],
            "4-2": [4, 25, 9],

            // Version 5
            "5-1": [1, 134, 108],
            "5-0": [2, 67, 43],
            "5-3": [2, 33, 15, 2, 34, 16],
            "5-2": [2, 33, 11, 2, 34, 12],

            // Version 6
            "6-1": [2, 86, 68],
            "6-0": [4, 43, 27],
            "6-3": [4, 43, 19],
            "6-2": [4, 43, 15],

            // Version 7
            "7-1": [2, 98, 78],
            "7-0": [4, 49, 31],
            "7-3": [2, 32, 14, 4, 33, 15],
            "7-2": [4, 39, 13, 1, 40, 14],

            // Version 8
            "8-1": [2, 121, 97],
            "8-0": [2, 60, 38, 2, 61, 39],
            "8-3": [4, 40, 18, 2, 41, 19],
            "8-2": [4, 40, 14, 2, 41, 15],

            // Version 9
            "9-1": [2, 146, 116],
            "9-0": [3, 58, 36, 2, 59, 37],
            "9-3": [4, 36, 16, 4, 37, 17],
            "9-2": [4, 36, 12, 4, 37, 13],

            // Version 10
            "10-1": [2, 86, 68, 2, 87, 69],
            "10-0": [4, 69, 43, 1, 70, 44],
            "10-3": [6, 43, 19, 2, 44, 20],
            "10-2": [6, 43, 15, 2, 44, 16],
        };

        const key = `${typeNumber}-${errorCorrectLevel}`;
        const result = rsBlockTable[key];

        if (!result) {
            throw new Error(
                `No RS block data for version ${typeNumber}, error level ${errorCorrectLevel}`,
            );
        }

        return result;
    }

    private getTotalDataCount(): number {
        let totalDataCount = 0;
        const rsBlocks = this.getRSBlocks();

        for (let i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
        }

        return totalDataCount;
    }

    private getLengthInBits(mode: number): number {
        const typeNumber = this.getTypeNumber();

        if (1 <= typeNumber && typeNumber < 10) {
            switch (mode) {
                case QRCodeGenerator.MODE_NUMBER:
                    return 10;
                case QRCodeGenerator.MODE_ALPHA_NUM:
                    return 9;
                case QRCodeGenerator.MODE_8BIT_BYTE:
                    return 8;
                default:
                    return 8;
            }
        } else if (typeNumber < 27) {
            switch (mode) {
                case QRCodeGenerator.MODE_NUMBER:
                    return 12;
                case QRCodeGenerator.MODE_ALPHA_NUM:
                    return 11;
                case QRCodeGenerator.MODE_8BIT_BYTE:
                    return 16;
                default:
                    return 16;
            }
        } else {
            switch (mode) {
                case QRCodeGenerator.MODE_NUMBER:
                    return 14;
                case QRCodeGenerator.MODE_ALPHA_NUM:
                    return 13;
                case QRCodeGenerator.MODE_8BIT_BYTE:
                    return 16;
                default:
                    return 16;
            }
        }
    }

    private getErrorCorrectPolynomial(
        errorCorrectLength: number,
    ): QRPolynomial {
        let a = new QRPolynomial([1], 0);

        for (let i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, this.gexp(i)], 0));
        }

        return a;
    }

    public glog(n: number): number {
        if (n < 1) throw new Error("glog(" + n + ")");

        return QRCodeGenerator.LOG_TABLE[n];
    }

    public gexp(n: number): number {
        while (n < 0) {
            n += 255;
        }

        while (n >= 256) {
            n -= 255;
        }

        return QRCodeGenerator.EXP_TABLE[n];
    }

    private static readonly EXP_TABLE = Array(256);
    private static readonly LOG_TABLE = Array(256);

    public static initializeTables() {
        for (let i = 0; i < 8; i++) {
            QRCodeGenerator.EXP_TABLE[i] = 1 << i;
        }
        for (let i = 8; i < 256; i++) {
            QRCodeGenerator.EXP_TABLE[i] =
                QRCodeGenerator.EXP_TABLE[i - 4] ^
                QRCodeGenerator.EXP_TABLE[i - 5] ^
                QRCodeGenerator.EXP_TABLE[i - 6] ^
                QRCodeGenerator.EXP_TABLE[i - 8];
        }
        for (let i = 0; i < 255; i++) {
            QRCodeGenerator.LOG_TABLE[QRCodeGenerator.EXP_TABLE[i]] = i;
        }
    }

    isDark(row: number, col: number): boolean {
        if (
            row < 0 ||
            this.moduleCount <= row ||
            col < 0 ||
            this.moduleCount <= col
        ) {
            throw new Error(row + "," + col);
        }
        return this.modules[row][col];
    }
}

class QRBitBuffer {
    buffer: number[] = [];
    length = 0;

    get(index: number): boolean {
        const bufIndex = Math.floor(index / 8);
        return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) === 1;
    }

    put(num: number, length: number) {
        for (let i = 0; i < length; i++) {
            this.putBit(((num >>> (length - i - 1)) & 1) === 1);
        }
    }

    getLengthInBits(): number {
        return this.length;
    }

    putBit(bit: boolean) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
            this.buffer.push(0);
        }

        if (bit) {
            this.buffer[bufIndex] |= 0x80 >>> this.length % 8;
        }

        this.length++;
    }
}

abstract class QRData {
    mode: number;
    data: string;

    constructor(mode: number, data: string) {
        this.mode = mode;
        this.data = data;
    }

    abstract getLength(): number;
    abstract write(buffer: QRBitBuffer): void;
}

class QR8bitByte extends QRData {
    constructor(data: string) {
        super(QRCodeGenerator.MODE_8BIT_BYTE, data);
    }

    getLength(): number {
        return this.data.length;
    }

    write(buffer: QRBitBuffer) {
        for (let i = 0; i < this.data.length; i++) {
            buffer.put(this.data.charCodeAt(i), 8);
        }
    }
}

class QRPolynomial {
    num: number[];

    constructor(num: number[], shift: number) {
        if (num.length === 0) {
            throw new Error(num.length + "/" + shift);
        }

        let offset = 0;

        while (offset < num.length && num[offset] === 0) {
            offset++;
        }

        this.num = Array(num.length - offset + shift);
        for (let i = 0; i < num.length - offset; i++) {
            this.num[i] = num[i + offset];
        }
    }

    get(index: number): number {
        return this.num[index];
    }

    getLength(): number {
        return this.num.length;
    }

    multiply(e: QRPolynomial): QRPolynomial {
        const num = Array(this.getLength() + e.getLength() - 1);

        for (let i = 0; i < this.getLength(); i++) {
            for (let j = 0; j < e.getLength(); j++) {
                num[i + j] ^= QRCodeGenerator.prototype.gexp(
                    QRCodeGenerator.prototype.glog(this.get(i)) +
                        QRCodeGenerator.prototype.glog(e.get(j)),
                );
            }
        }

        return new QRPolynomial(num, 0);
    }

    mod(e: QRPolynomial): QRPolynomial {
        if (this.getLength() - e.getLength() < 0) {
            return this;
        }

        const ratio =
            QRCodeGenerator.prototype.glog(this.get(0)) -
            QRCodeGenerator.prototype.glog(e.get(0));

        const num = Array(this.getLength());

        for (let i = 0; i < this.getLength(); i++) {
            num[i] = this.get(i);
        }

        for (let i = 0; i < e.getLength(); i++) {
            num[i] ^= QRCodeGenerator.prototype.gexp(
                QRCodeGenerator.prototype.glog(e.get(i)) + ratio,
            );
        }

        return new QRPolynomial(num, 0).mod(e);
    }
}

class RSBlock {
    totalCount: number;
    dataCount: number;

    constructor(totalCount: number, dataCount: number) {
        this.totalCount = totalCount;
        this.dataCount = dataCount;
    }
}

QRCodeGenerator.initializeTables();

export const QRDisplay: React.FC<QRDisplayProps> = ({
    data,
    size = 200,
    backgroundColor = "white",
    foregroundColor = "black",
}) => {
    const modules = React.useMemo(() => {
        const generator = new QRCodeGenerator();
        generator.addData(data);
        generator.make();

        const moduleCount = generator.getModuleCount();
        const moduleSize = size / moduleCount;
        const result: QRModule[] = [];

        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (generator.isDark(row, col)) {
                    result.push({
                        x: col * moduleSize,
                        y: row * moduleSize,
                        width: moduleSize,
                        height: moduleSize,
                    });
                }
            }
        }
        return { modules: result, moduleSize };
    }, [data, size]);

    const [cornerRadius, setCornerRadius] = React.useState(0);

    React.useEffect(() => {
        const maxRadius = modules.moduleSize / 2;
        const duration = 6000;
        let startTime: number | null = null;
        let animationFrame: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = (elapsed % (duration * 2)) / duration;

            // Oscillate between 0 and maxRadius
            const value =
                progress <= 1
                    ? progress * maxRadius // 0 to maxRadius
                    : (2 - progress) * maxRadius; // maxRadius back to 0

            setCornerRadius(value);
            animationFrame = requestAnimationFrame(animate);
        };

        animationFrame = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationFrame);
    }, [modules.moduleSize]);

    return (
        <View style={{ width: size, height: size }}>
            <Canvas style={{ width: size, height: size }}>
                <Rect
                    x={0}
                    y={0}
                    width={size}
                    height={size}
                    color={backgroundColor}
                />
                {modules.modules.map((module, index) => (
                    <RoundedRect
                        key={index}
                        x={module.x}
                        y={module.y}
                        width={module.width}
                        height={module.height}
                        r={cornerRadius}
                        color={foregroundColor}
                        style="fill"
                    />
                ))}
            </Canvas>
        </View>
    );
};
