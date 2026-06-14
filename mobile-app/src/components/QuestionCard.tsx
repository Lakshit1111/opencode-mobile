import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import type { QuestionRequest } from "../types/opencode";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";

interface Props {
  request: QuestionRequest;
  onReply: (requestID: string, answers: string[][]) => Promise<void>;
}

export default function QuestionCard({ request, onReply }: Props) {
  const [selectedOptions, setSelectedOptions] = useState<string[][]>([]);
  const [customAnswer, setCustomAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOption = (questionIdx: number, option: string) => {
    setSelectedOptions((prev) => {
      const next = [...prev];
      if (request.questions[questionIdx]?.multiple) {
        const existing = next[questionIdx] || [];
        if (existing.includes(option)) {
          next[questionIdx] = existing.filter((o) => o !== option);
        } else {
          next[questionIdx] = [...existing, option];
        }
      } else {
        next[questionIdx] = [option];
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const answers = request.questions.map((q, i) => {
        const selected = selectedOptions[i] || [];
        if (selected.length === 0 && q.custom !== false) {
          return [customAnswer || ""];
        }
        return selected;
      });
      await onReply(request.id, answers);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      {request.questions.map((q, qi) => (
        <View key={qi} style={styles.question}>
          <Text style={styles.questionHeader}>{q.header}</Text>
          <Text style={styles.questionText}>{q.question}</Text>
          {q.options.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={[
                styles.option,
                selectedOptions[qi]?.includes(opt.label) && styles.optionSelected,
              ]}
              onPress={() => handleOption(qi, opt.label)}
              disabled={loading}
            >
              <Text
                style={[
                  styles.optionLabel,
                  selectedOptions[qi]?.includes(opt.label) && styles.optionLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
              <Text style={styles.optionDesc}>{opt.description}</Text>
            </TouchableOpacity>
          ))}
          {q.custom !== false && (
            <TextInput
              style={styles.customInput}
              placeholder="Type your own answer..."
              placeholderTextColor={Colors.dark.textMuted}
              value={customAnswer}
              onChangeText={setCustomAnswer}
              editable={!loading}
            />
          )}
        </View>
      ))}
      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.submitText}>Submit Answer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0d1b2a",
    borderRadius: BorderRadii.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  question: {
    marginBottom: Spacing.md,
  },
  questionHeader: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.accent,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  questionText: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  option: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadii.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  optionSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: "#0d2137",
  },
  optionLabel: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  optionLabelSelected: {
    color: Colors.dark.accent,
  },
  optionDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  customInput: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadii.sm,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    marginTop: Spacing.xs,
  },
  submitBtn: {
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadii.sm,
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: FontSizes.md,
  },
});