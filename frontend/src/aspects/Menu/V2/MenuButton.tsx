import { As, Button, PropsOf, Tooltip, useBreakpointValue } from "@chakra-ui/react";
import * as R from "ramda";
import React, { forwardRef } from "react";
import { defaultOutline_AsBoxShadow } from "../../Chakra/ChakraCustomProvider";
import { FAIcon } from "../../Icons/FAIcon";

type Props<T extends As<any> = typeof Button> = PropsOf<T> & {
    label: string;
    iconStyle: "b" | "s" | "r";
    icon: string | string[];
    side: "left" | "right";
    noTooltip?: boolean;
};

const MenuButton = forwardRef<HTMLButtonElement, Props>(function MenuButton(
    { label, iconStyle, icon, side, noTooltip, children, ...props }: React.PropsWithChildren<Props>,
    ref
): JSX.Element {
    const size = useBreakpointValue({
        base: "md",
        lg: "lg",
    });
    const expandedFontSize = useBreakpointValue({
        base: "xl",
        lg: "2xl",
    });
    const barWidth = useBreakpointValue({
        base: "3.5em",
        lg: "4em",
    });
    const button = (
        <Button
            aria-label={label}
            size={size}
            minW={barWidth}
            _hover={{
                fontSize: expandedFontSize,
                borderLeftRadius: side === "right" ? 2 : undefined,
                borderRightRadius: side === "left" ? 2 : undefined,
            }}
            _focus={{
                fontSize: expandedFontSize,
                borderLeftRadius: side === "right" ? 2 : undefined,
                borderRightRadius: side === "left" ? 2 : undefined,
                boxShadow: defaultOutline_AsBoxShadow,
                m: "2px",
                mr: side === "right" ? 0 : undefined,
                ml: side === "left" ? 0 : undefined,
            }}
            ref={ref}
            {...props}
        >
            {typeof icon === "string" ? (
                <FAIcon iconStyle={iconStyle} icon={icon} />
            ) : (
                R.intersperse(
                    <>&nbsp;/&nbsp;</>,
                    icon.map((ic, idx) => <FAIcon key={idx} iconStyle={iconStyle} icon={ic} />)
                )
            )}
            {children}
        </Button>
    );
    return noTooltip ? button : <Tooltip label={label}>{button}</Tooltip>;
});

export default MenuButton;