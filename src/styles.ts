/*
 * Copyright (c) 2024, Psiphon Inc.
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
import { StyleSheet } from "react-native";

export const palette = {
    black: "#231F20",
    redTint5: "#faebe9",
    redTint4: "#f2c5be",
    redTint3: "#ea9f93",
    redTint2: "#e17968",
    redTint1: "#d9533d",
    red: "#d54028",
    redShade1: "#bf3924",
    redShade2: "#952c1c",
    redShade3: "#6a2014",
    redShade4: "#3f130c",
    redShade5: "#150604",
    blueTint5: "#ebf1f4",
    blueTint4: "#c4d7df",
    blueTint3: "#9dbcca",
    blueTint2: "#75a1b5",
    blueTint1: "#4e87a0",
    blue: "#3b7a96",
    blueShade1: "#356d87",
    blueShade2: "#2f6178",
    blueShade3: "#23495a",
    blueShade4: "#17303c",
    blueShade5: "#0b181e",
    purpleTint5: "#ded9e0",
    purpleTint4: "#beb3c1",
    purpleTint3: "#9d8da2",
    purpleTint2: "#7d6783",
    purpleTint1: "#6d5473",
    purple: "#4E3677",
    purpleShade1: "#533b5a",
    purpleShade2: "#412e46",
    purpleShade3: "#2e2132",
    purpleShade4: "#1b131e",
    purpleShade5: "#09060a",
    maroon: "#513241",
    white: "#E0E0E0",
    midGrey: "#191224",
    grey: "#342F2F",
    transparent: "rgba(0,0,0,0)",
    transparentBlue: "rgba(59,122,150,0.5)",
    transparentPurple: "rgba(93,66,100,0.4)",
    statusTextBlue: "#4B7993",
    peach: "#f5a086",
    mauve: "#9d81c9",
    fadedMauve: "#c8bae1",
    deepMauve: "#6a548d",
    peachyMauve: "#755484",
    thinPurple: "rgba(156, 129, 201, 0.6)",
    whiteHighlight: "rgba(255, 255, 255, 0.6)",
};

export const sharedStyles = StyleSheet.create({
    column: {
        flexDirection: "column",
        gap: 10,
    },
    row: {
        flexDirection: "row",
        gap: 10,
    },
    nogap: {
        gap: 0,
    },
    doubleGap: {
        gap: 20,
    },
    halfGap: {
        gap: 5,
    },
    fullWidth: {
        width: "100%",
        maxWidth: "100%",
    },
    fullHeight: {
        height: "100%",
        maxHeight: "100%",
    },
    padded: {
        padding: 10,
    },
    paddedVertical: {
        paddingVertical: 10,
    },
    paddedHorizontal: {
        paddingHorizontal: 10,
    },
    halfPadded: {
        padding: 5,
    },
    doublePadded: {
        padding: 20,
    },
    margin: {
        margin: 10,
    },
    doubleMargin: {
        margin: 20,
    },
    paddedLeft: {
        paddingLeft: 10,
    },
    paddedRight: {
        paddingRight: 10,
    },
    paddedTop: {
        paddingTop: 10,
    },
    paddedTop20: {
        paddingTop: 20,
    },
    paddedTop40: {
        paddingTop: 40,
    },
    height30: {
        height: 30,
        maxHeight: 30,
        minHeight: 30,
    },
    height40: {
        height: 40,
        maxHeight: 40,
        minHeight: 40,
    },
    height60: {
        height: 60,
        maxHeight: 60,
        minHeight: 60,
    },
    height80: {
        height: 80,
        maxHeight: 80,
        minHeight: 80,
    },
    height100: {
        height: 100,
        maxHeight: 100,
        minHeight: 100,
    },
    height120: {
        height: 120,
        maxHeight: 120,
        minHeight: 120,
    },
    height180: {
        height: 180,
        maxHeight: 180,
        minHeight: 180,
    },
    height200: {
        height: 200,
        maxHeight: 200,
        minHeight: 200,
    },
    height300: {
        height: 300,
        maxHeight: 300,
        minHeight: 300,
    },
    width30: {
        width: 30,
        maxWidth: 30,
        minWidth: 30,
    },
    width60: {
        width: 60,
        maxWidth: 60,
        minWidth: 60,
    },
    width80: {
        width: 80,
        maxWidth: 80,
    },
    width150: {
        width: 150,
        maxWidth: 150,
        minWidth: 150,
    },
    width350: {
        width: 350,
        maxWidth: 350,
        minWidth: 350,
    },
    flex: {
        flex: 1,
    },
    justifyCenter: {
        justifyContent: "center",
    },
    justifyFlexStart: {
        justifyContent: "flex-start",
    },
    justifyFlexEnd: {
        justifyContent: "flex-end",
    },
    justifySpaceBetween: {
        justifyContent: "space-between",
    },
    justifySpaceAround: {
        justifyContent: "space-around",
    },
    alignFlexStart: {
        alignItems: "flex-start",
    },
    alignFlexEnd: {
        alignItems: "flex-end",
    },
    alignCenter: {
        alignItems: "center",
    },
    rounded5: {
        borderRadius: 5,
    },
    rounded10: {
        borderRadius: 10,
    },
    rounded20: {
        borderRadius: 20,
    },
    rounded40: {
        borderRadius: 40,
    },
    roundedTop40: {
        borderTopRightRadius: 35,
        borderTopLeftRadius: 35,
    },
    flexWrap: {
        flexWrap: "wrap",
    },
    tinyFont: {
        fontSize: 12,
        fontFamily: "JuraRegular",
    },
    bodyFont: {
        fontSize: 18,
        fontFamily: "JuraBold",
    },
    largeFont: {
        fontSize: 24,
        fontFamily: "JuraRegular",
    },
    extraLargeFont: {
        fontSize: 32,
        fontFamily: "JuraRegular",
    },
    boldFont: {
        fontSize: 20,
        fontFamily: "JuraBold",
    },
    whiteText: {
        color: palette.white,
    },
    greyText: {
        color: palette.midGrey,
    },
    blackText: {
        color: palette.black,
    },
    purpleText: {
        color: palette.purple,
    },
    centeredText: {
        textAlign: "center",
    },
    whiteBorderLeft: {
        borderLeftWidth: 1,
        borderColor: palette.white,
    },
    whiteBorderBottom: {
        borderBottomWidth: 1,
        borderColor: palette.white,
    },
    greyBorderBottom: {
        borderBottomWidth: 1,
        borderColor: palette.midGrey,
    },
    greyBorderTop: {
        borderBottomWidth: 1,
        borderColor: palette.midGrey,
    },
    blackBg: {
        backgroundColor: palette.black,
    },
    whiteBg: {
        backgroundColor: palette.white,
    },
    transparentBg: {
        backgroundColor: "transparent",
    },
    whiteBorder: {
        borderColor: palette.white,
        borderWidth: 1,
    },
    greyBorder: {
        borderColor: palette.grey,
        borderWidth: 1,
    },
    midGreyBorder: {
        borderColor: palette.midGrey,
        borderWidth: 1,
    },
    purpleBorder: {
        borderColor: palette.purple,
        borderWidth: 1,
    },
    absoluteFill: {
        position: "absolute",
        height: "100%",
        width: "100%",
    },
    modalBottom90: {
        flex: 1,
        height: "90%",
        width: "100%",
        position: "absolute",
        bottom: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 2,
        borderBottomWidth: 0,
        borderColor: palette.black,
    },
    modalCenter: {
        flex: 1,
        height: "50%",
        width: "80%",
        backgroundColor: palette.grey,
        borderRadius: 18,
        position: "absolute",
        left: "10%",
        top: "25%",
    },
    modalCenterSmall: {
        flex: 1,
        height: "35%",
        width: "80%",
        backgroundColor: palette.grey,
        borderRadius: 18,
        position: "absolute",
        left: "10%",
        top: "25%",
    },
    textInput: {
        borderWidth: 1,
        borderRadius: 20,
        padding: 20,
        backgroundColor: palette.grey,
        color: palette.white,
        width: "100%",
    },
    circle12: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    circle38: {
        width: 38,
        height: 38,
        borderRadius: 19,
    },
    circle50: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    circle158: {
        height: 158,
        width: 158,
        borderRadius: 79,
    },
    circle296: {
        height: 296,
        width: 296,
        borderRadius: 148,
    },
    absolute: {
        position: "absolute",
    },
    right10: {
        right: 10,
    },
    absoluteTopLeft: {
        position: "absolute",
        left: 10,
        top: 10,
    },
    absoluteTopRight: {
        position: "absolute",
        top: 10,
        right: 10,
    },
    absoluteBottomLeft: {
        position: "absolute",
        left: 10,
        bottom: 10,
    },
    absoluteBottomRight: {
        position: "absolute",
        right: 10,
        bottom: 10,
    },
    underlay: {
        position: "absolute",
        left: 0,
        top: 0,
        opacity: 0.7,
        height: "100%",
        width: "100%",
        backgroundColor: "black",
    },
});

export const lineItemStyle = [
    sharedStyles.padded,
    sharedStyles.row,
    sharedStyles.height60,
    sharedStyles.greyBorderBottom,
];

export const iconButton = [
    sharedStyles.rounded5,
    sharedStyles.justifyCenter,
    sharedStyles.alignCenter,
    {
        backgroundColor: palette.black,
    },
];

export const fonts = {
    JuraRegular: require("@/assets/fonts/Jura-Regular.otf"),
    JuraBold: require("@/assets/fonts/Jura-Bold.otf"),
    Rajdhani: require("@/assets/fonts/Rajdhani-Regular.otf"),
};
