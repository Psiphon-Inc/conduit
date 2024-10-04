import { Group } from "@shopify/react-native-skia";
import { SharedValue } from "react-native-reanimated";

import { Chains } from "@/src/components/canvas/Chains";
import { FlexibleOrb } from "@/src/components/canvas/FlexibleOrb";
import { Phone } from "./Phone";

interface OnboardingSceneProps {
    currentView: SharedValue<number>;
    sceneWidth: number;
    sceneHeight: number;
}
export function OnboardingScene({
    currentView,
    sceneWidth,
    sceneHeight,
}: OnboardingSceneProps) {
    const commonProps = { currentView, sceneWidth, sceneHeight };
    return (
        <Group>
            <FlexibleOrb {...commonProps} />
            <Group
                transform={[{ translateY: sceneHeight / 2 }, { rotate: 0.03 }]}
            >
                <Chains {...commonProps} size={sceneWidth / 3} />
            </Group>
            <Phone {...commonProps} />
        </Group>
    );
}
