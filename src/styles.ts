import { StyleSheet } from "react-native";

export const palette = {
    black: "#000000",
    red: "#d54028",
    blue: "#3b7a96",
    purple: "#5d4264",
    white: "#ffffff",
    grey: "#342F2F",
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
    bodyFont: {
        fontSize: 16,
        fontFamily: "SpaceMono",
    },
    largeFont: {
        fontSize: 24,
        fontFamily: "SpaceMono",
    },
    extraLargeFont: {
        fontSize: 32,
        fontFamily: "SpaceMono",
    },
    boldFont: {
        fontSize: 20,
        fontFamily: "SpaceMono",
    },
    whiteText: {
        color: palette.white,
    },
    blackText: {
        color: palette.black,
    },
    centeredText: {
        textAlign: "center",
    },
    whiteBorderLeft: {
        borderLeftWidth: 1,
        borderColor: palette.white,
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
    absoluteFill: {
        position: "absolute",
        height: "100%",
        width: "100%",
    },
    modalHalfBottom: {
        flex: 1,
        height: "50%",
        width: "100%",
        backgroundColor: palette.grey,
        borderTopRightRadius: 40,
        borderTopLeftRadius: 40,
        position: "absolute",
        padding: 20,
        bottom: 0,
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
    underlay: {
        position: "absolute",
        left: 0,
        top: 0,
        opacity: 0.5,
        height: "100%",
        width: "100%",
        backgroundColor: "black",
    },
});
