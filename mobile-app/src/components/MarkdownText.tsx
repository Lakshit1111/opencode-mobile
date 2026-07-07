import React from "react";
import { Platform } from "react-native";
import Markdown from "react-native-markdown-display";
import { Colors, FontSizes, Spacing } from "../constants/theme";

const theme = {
  body: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    lineHeight: FontSizes.md * 1.5,
  },
  heading1: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: "700" as const,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  heading2: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "700" as const,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  heading3: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "600" as const,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  code_inline: {
    color: Colors.dark.primaryLight,
    backgroundColor: Colors.dark.surfaceHover,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: FontSizes.sm,
  },
  fence: {
    color: Colors.dark.text,
    backgroundColor: "#0d1117",
    padding: Spacing.md,
    borderRadius: 6,
    marginVertical: Spacing.sm,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: FontSizes.sm,
    lineHeight: FontSizes.sm * 1.5,
  },
  code_block: {
    color: Colors.dark.text,
    backgroundColor: "#0d1117",
    padding: Spacing.md,
    borderRadius: 6,
    marginVertical: Spacing.sm,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: FontSizes.sm,
  },
  bullet_list: {
    marginVertical: Spacing.xs,
  },
  ordered_list: {
    marginVertical: Spacing.xs,
  },
  list_item: {
    marginVertical: 2,
  },
  strong: {
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  em: {
    fontStyle: "italic" as const,
    color: Colors.dark.textSecondary,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.accent,
    paddingLeft: Spacing.md,
    marginVertical: Spacing.sm,
    opacity: 0.8,
  },
  link: {
    color: Colors.dark.accent,
    textDecorationLine: "underline" as const,
  },
};

interface Props {
  text: string;
}

export default function MarkdownText({ text }: Props) {
  return <Markdown style={theme}>{text}</Markdown>;
}