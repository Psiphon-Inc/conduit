import { ColorMatrix, Group, Paint } from "@shopify/react-native-skia";
import { SharedValue, useDerivedValue } from "react-native-reanimated";

/*
 * FaderGroup wraps Canvas elements in a Group that will fade in or out
 * depending on the SharedValue passed in.
 */
export function FaderGroup({
    opacity,
    children,
}: {
    opacity: SharedValue<number>;
    children: React.JSX.Element;
}) {
    const opacityMatrix = useDerivedValue(() => {
        const a = opacity.value;
        // prettier-ignore
        return [
         // R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, a, 0,
        ];
    });

    return (
        <Group
            layer={
                <Paint>
                    <ColorMatrix matrix={opacityMatrix} />
                </Paint>
            }
        >
            {children}
        </Group>
    );
}
