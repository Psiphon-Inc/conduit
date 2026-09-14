import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

import { useAppAppearance } from "@/src/appearance/AppAppearance";
import { Icon } from "@/src/components/Icon";
import { useHostedPromotion } from "@/src/hosted-promotion/HostedPromotion";

/** Accessible 44px close target, rendered as a sibling of promotional navigation controls. */
export function HostedPromotionCloseButton() {
    const { dismiss } = useHostedPromotion();
    const { skin } = useAppAppearance();
    const { t } = useTranslation();
    return (
        <Pressable
            testID="dismiss-hosted-promotion"
            accessibilityRole="button"
            accessibilityLabel={t("DISMISS_HOSTED_PROMOTION_I18N.string")}
            onPress={dismiss}
            style={{
                position: "absolute",
                top: 2,
                right: 2,
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1,
            }}
        >
            <Icon name="close" color={skin.accent} size={16} />
        </Pressable>
    );
}
