import { parseHex } from "@/src/common/utils";

const SVG_CONSTANTS = {
    XMLNS: "http://www.w3.org/2000/svg",
    WIDTH: "width",
    HEIGHT: "height",
};

class Point {
    x: number;
    y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
}

export class Transform {
    _x: number;
    _y: number;
    _size: number;
    _rotation: number;

    constructor(x: number, y: number, size: number, rotation: number) {
        this._x = x;
        this._y = y;
        this._size = size;
        this._rotation = rotation;
    }

    /**
     * Transforms the specified point based on the translation and rotation specification for this Transform.
     */
    transformIconPoint(x: number, y: number, w: number = 0, h: number = 0) {
        const right = this._x + this._size,
            bottom = this._y + this._size,
            rotation = this._rotation;
        return rotation === 1
            ? new Point(right - y - (h || 0), this._y + x)
            : rotation === 2
              ? new Point(right - x - (w || 0), bottom - y - (h || 0))
              : rotation === 3
                ? new Point(this._x + y, bottom - x - (w || 0))
                : new Point(this._x + x, this._y + y);
    }
}

class SvgPath {
    dataString: string;

    constructor() {
        this.dataString = "";
    }

    svgValue(value: number) {
        return ((value * 10 + 0.5) | 0) / 10;
    }
    addPolygon(points: Point[]) {
        let dataString = "";
        for (let i = 0; i < points.length; i++) {
            dataString +=
                (i ? "L" : "M") +
                this.svgValue(points[i].x) +
                " " +
                this.svgValue(points[i].y);
        }
        this.dataString += dataString + "Z";
    }
    addCircle(point: Point, diameter: number, counterClockwise: boolean) {
        const sweepFlag = counterClockwise ? 0 : 1,
            svgRadius = this.svgValue(diameter / 2),
            svgDiameter = this.svgValue(diameter),
            svgArc =
                "a" + svgRadius + "," + svgRadius + " 0 1," + sweepFlag + " ";

        this.dataString +=
            "M" +
            this.svgValue(point.x) +
            " " +
            this.svgValue(point.y + diameter / 2) +
            svgArc +
            svgDiameter +
            ",0" +
            svgArc +
            -svgDiameter +
            ",0";
    }
}

function SvgElement_append(
    parentNode: Element,
    name: string,
    keyValuePairs: (string | number)[],
) {
    const el = document.createElementNS(SVG_CONSTANTS.XMLNS, name);

    for (let i = 0; i + 1 < keyValuePairs.length; i += 2) {
        el.setAttribute(
            /** @type {string} */ keyValuePairs[i].toString(),
            /** @type {string} */ keyValuePairs[i + 1].toString(),
        );
    }

    parentNode.appendChild(el);
}

export class SvgElement {
    iconSize: number;
    _el: Element;

    constructor(element: Element) {
        // Don't use the clientWidth and clientHeight on SVG elements
        // since Firefox won't serve a proper value of these properties on SVG
        // elements (https://bugzilla.mozilla.org/show_bug.cgi?id=874811)
        // Instead use 100 as a hardcoded size and let viewbox scale
        const iconSize = (this.iconSize = Math.min(
            Number(element.getAttribute(SVG_CONSTANTS.WIDTH)) || 100,
            Number(element.getAttribute(SVG_CONSTANTS.HEIGHT)) || 100,
        ));
        this._el = element;

        // Clear current SVG child elements
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }

        // Set viewBox attribute to ensure the svg scales nicely.
        element.setAttribute("viewBox", "0 0 " + iconSize + " " + iconSize);
        element.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
    setBackground(fillColor: string, opacity: number) {
        if (opacity) {
            SvgElement_append(this._el, "rect", [
                SVG_CONSTANTS.WIDTH,
                "100%",
                SVG_CONSTANTS.HEIGHT,
                "100%",
                "fill",
                fillColor,
                "opacity",
                opacity,
            ]);
        }
    }
    appendPath(color: string, dataString: string) {
        SvgElement_append(this._el, "path", ["fill", color, "d", dataString]);
    }
}

export class SvgRenderer {
    _path: SvgPath;
    _pathsByColor: any;
    _target: SvgElement | SvgWriter;
    iconSize: number;

    constructor(target: SvgElement | SvgWriter) {
        this._path = new SvgPath();
        this._pathsByColor = {};
        this._target = target;
        this.iconSize = target.iconSize;
    }

    setBackground(fillColor: string) {
        const match = /^(#......)(..)?/.exec(fillColor);
        let opacity;
        if (!match) {
            this._target.setBackground(fillColor, 1);
            return;
        }
        if (match[2]) {
            opacity = parseHex(match[2], 0) / 255;
        } else {
            opacity = 1;
        }
        this._target.setBackground(match[1], opacity);
    }
    beginShape(color: string) {
        this._path =
            this._pathsByColor[color] ||
            (this._pathsByColor[color] = new SvgPath());
    }
    endShape() {}
    addPolygon(points: Point[]) {
        this._path.addPolygon(points);
    }
    addCircle(point: Point, diameter: number, counterClockwise: boolean) {
        this._path.addCircle(point, diameter, counterClockwise);
    }
    finish() {
        const pathsByColor = this._pathsByColor;
        for (let color in pathsByColor) {
            // hasOwnProperty cannot be shadowed in pathsByColor
            // eslint-disable-next-line no-prototype-builtins
            if (pathsByColor.hasOwnProperty(color)) {
                this._target.appendPath(color, pathsByColor[color].dataString);
            }
        }
    }
}

export class SvgWriter {
    iconSize: number;
    _s: string;

    constructor(iconSize: number) {
        this.iconSize = iconSize;
        this._s =
            '<svg xmlns="' +
            SVG_CONSTANTS.XMLNS +
            '" width="' +
            iconSize +
            '" height="' +
            iconSize +
            '" viewBox="0 0 ' +
            iconSize +
            " " +
            iconSize +
            '">';
    }

    setBackground(fillColor: string, opacity: number) {
        if (opacity) {
            this._s +=
                '<rect width="100%" height="100%" fill="' +
                fillColor +
                '" opacity="' +
                opacity.toFixed(2) +
                '"/>';
        }
    }
    appendPath(color: string, dataString: string) {
        this._s += '<path fill="' + color + '" d="' + dataString + '"/>';
    }
    toString() {
        return this._s + "</svg>";
    }
}
