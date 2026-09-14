import { useAppAppearance } from "@/src/appearance/AppAppearance";
import type { AppSkinId } from "@/src/appearance/appSkins";

/** HTML radio provides Space/arrow keys and checked state that RN Web Pressable lacks. */
export function SkinRadioOption({
    id,
    label,
}: {
    id: AppSkinId;
    label: string;
}) {
    const { skin, selectSkin, persistence } = useAppAppearance();
    const checked = skin.id === id;
    return (
        <label
            style={{
                minHeight: 48,
                boxSizing: "border-box",
                padding: 12,
                border: `1px solid ${skin.border}`,
                borderRadius: 12,
                backgroundColor: checked
                    ? skin.selectedBackground
                    : "transparent",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                color: skin.text,
                fontFamily: "JuraBold",
                fontSize: 18,
            }}
        >
            <input
                type="radio"
                name="app-skin"
                value={id}
                checked={checked}
                data-testid={`skin-${id}`}
                onChange={() => selectSkin(id)}
                onClick={() => {
                    // Checked HTML radios do not fire change again. Keep the
                    // picker warning's "select it again to retry" action usable.
                    if (checked && persistence === "unavailable")
                        selectSkin(id);
                }}
                style={{ accentColor: skin.accent, margin: 0 }}
            />
            {label}
        </label>
    );
}
