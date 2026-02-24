import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const skill = {
  id: "nlp",
  name: "NLP & Text Processing",
  description: "Natural language processing - tokenization, sentiment analysis, NER, embeddings, summarization, translation, text classification. Supports spaCy, transformers, NLTK.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["tokenize", "sentences", "sentiment", "entities", "pos_tag", "lemmatize", "embeddings", "similarity", "summarize", "keywords", "classify", "translate", "detect_language", "readability", "word_frequency", "ngrams", "topic_model", "clean", "extract_urls", "extract_emails", "extract_dates", "spell_check", "correct_spelling"],
        description: "NLP action to perform"
      },
      text: {
        type: "string",
        description: "Input text"
      },
      texts: {
        type: "array",
        description: "Multiple texts for batch processing",
        items: { type: "string" }
      },
      file: {
        type: "string",
        description: "Input file path"
      },
      output: {
        type: "string",
        description: "Output file path"
      },
      model: {
        type: "string",
        description: "Model to use"
      },
      language: {
        type: "string",
        description: "Language code (en, es, fr, de, etc.)"
      },
      targetLanguage: {
        type: "string",
        description: "Target language for translation"
      },
      nGramSize: {
        type: "number",
        description: "N-gram size"
      },
      topN: {
        type: "number",
        description: "Top N results"
      },
      minScore: {
        type: "number",
        description: "Minimum score threshold"
      },
      comparisonText: {
        type: "string",
        description: "Text to compare with for similarity"
      },
      options: {
        type: "object",
        description: "Additional options",
        additionalProperties: true
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const text = input?.text;
    const texts = input?.texts;
    const file = input?.file;
    const output = input?.output;
    const model = input?.model;
    const language = input?.language || "en";
    const targetLanguage = input?.targetLanguage;
    const nGramSize = input?.nGramSize || 2;
    const topN = input?.topN || 10;
    const minScore = input?.minScore || 0.5;
    const comparisonText = input?.comparisonText;
    const options = input?.options || {};

    const outputDir = path.join(workspaceRoot, "output", "nlp");
    await mkdir(outputDir, { recursive: true });

    const execPython = (code, timeoutMs = 180000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("uv", ["run", "--with", "textblob", "--with", "langdetect", "python", "-c", code], {
          env: { ...process.env, PYTHONIOENCODING: "utf-8", UV_SYSTEM_PYTHON: "1" },
          windowsHide: true,
          cwd: workspaceRoot
        });

        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, timeoutMs);

        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });

        child.on("close", (code) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: code, stdout, stderr });
        });

        child.on("error", (err) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: -1, stdout, stderr, error: err.message });
        });
      });
    };

    const parseResult = (result) => {
      if (result.exitCode !== 0) {
        return { ok: false, error: result.stderr || result.error || "Python execution failed" };
      }
      try {
        const parsed = JSON.parse(result.stdout);
        return { ok: true, ...parsed };
      } catch {
        return { ok: true, output: result.stdout };
      }
    };

    let inputText = text || "";
    if (file && !text) {
      try {
        inputText = await readFile(path.resolve(workspaceRoot, file), "utf8");
      } catch (err) {
        return { ok: false, error: `Failed to read file: ${err.message}` };
      }
    }

    const baseCode = `
import json
import re
import sys

def output(data):
    print(json.dumps(data, default=str))
`;

    const spacyModel = model || (language === "en" ? "en_core_web_sm" : `${language}_core_news_sm`);

    switch (action) {
      case "tokenize": {
        const code = `${baseCode}
import re

text = """${(inputText || "").replace(/"/g, '\\"')}"""

tokens = re.findall(r'\\b\\w+\\b', text.lower())
result = {"tokens": tokens[:${topN * 10}], "count": len(tokens)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "sentences": {
        const code = `${baseCode}
import re

text = """${(inputText || "").replace(/"/g, '\\"')}"""

sentences = re.split(r'(?<=[.!?])\\s+', text)
sentences = [s.strip() for s in sentences if s.strip()]
result = {"sentences": sentences, "count": len(sentences)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "sentiment": {
        const code = `${baseCode}
try:
    from textblob import TextBlob
except ImportError:
    output({"ok": False, "error": "textblob not installed. Run: pip install textblob"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

blob = TextBlob(text)
sentiment = blob.sentiment

result = {
    "polarity": round(sentiment.polarity, 4),
    "subjectivity": round(sentiment.subjectivity, 4),
    "label": "positive" if sentiment.polarity > 0.1 else ("negative" if sentiment.polarity < -0.1 else "neutral")
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "entities":
      case "ner": {
        const code = `${baseCode}
try:
    import spacy
except ImportError:
    output({"ok": False, "error": "spacy not installed. Run: pip install spacy && python -m spacy download en_core_web_sm"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

try:
    nlp = spacy.load("${spacyModel}")
except:
    output({"ok": False, "error": "Model not found. Run: python -m spacy download ${spacyModel}"})
    exit()

doc = nlp(text)
entities = [{"text": ent.text, "label": ent.label_, "start": ent.start_char, "end": ent.end_char} for ent in doc.ents]

result = {"entities": entities, "count": len(entities)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "pos_tag": {
        const code = `${baseCode}
try:
    import spacy
except ImportError:
    output({"ok": False, "error": "spacy not installed"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

try:
    nlp = spacy.load("${spacyModel}")
except:
    output({"ok": False, "error": "Model not found"})
    exit()

doc = nlp(text)
pos_tags = [{"text": token.text, "pos": token.pos_, "tag": token.tag_, "lemma": token.lemma_} for token in doc]

result = {"pos_tags": pos_tags, "count": len(pos_tags)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "lemmatize": {
        const code = `${baseCode}
try:
    import spacy
except ImportError:
    output({"ok": False, "error": "spacy not installed"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

try:
    nlp = spacy.load("${spacyModel}")
except:
    output({"ok": False, "error": "Model not found"})
    exit()

doc = nlp(text)
lemmatized = [{"original": token.text, "lemma": token.lemma_} for token in doc if not token.is_punct]

result = {"lemmatized": lemmatized}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "embeddings": {
        const code = `${baseCode}
try:
    import spacy
    import numpy as np
except ImportError:
    output({"ok": False, "error": "spacy not installed"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

try:
    nlp = spacy.load("${spacyModel}")
except:
    output({"ok": False, "error": "Model not found. Use a model with word vectors like en_core_web_md"})
    exit()

doc = nlp(text)
vector = doc.vector.tolist() if doc.vector.any() else None
dim = len(doc.vector) if doc.vector.any() else 0

result = {"embedding": vector, "dimensions": dim, "hasVectors": doc.vector.any()}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "similarity": {
        if (!comparisonText) throw new Error("comparisonText is required for similarity");
        const code = `${baseCode}
try:
    import spacy
except ImportError:
    output({"ok": False, "error": "spacy not installed"})
    exit()

text1 = """${(inputText || "").replace(/"/g, '\\"')}"""
text2 = """${comparisonText.replace(/"/g, '\\"')}"""

try:
    nlp = spacy.load("${spacyModel}")
except:
    output({"ok": False, "error": "Model not found"})
    exit()

doc1 = nlp(text1)
doc2 = nlp(text2)

try:
    similarity = doc1.similarity(doc2)
except:
    similarity = None

result = {"similarity": round(similarity, 4) if similarity else None}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "summarize": {
        const sentencesCount = options.sentences || 3;
        const code = `${baseCode}
import re
from collections import Counter
import math

text = """${(inputText || "").replace(/"/g, '\\"')}"""

sentences = re.split(r'(?<=[.!?])\\s+', text)
sentences = [s.strip() for s in sentences if len(s.strip()) > 20]

words = re.findall(r'\\b[a-zA-Z]+\\b', text.lower())
word_freq = Counter(words)

def score_sentence(sentence):
    words = re.findall(r'\\b[a-zA-Z]+\\b', sentence.lower())
    if not words:
        return 0
    return sum(word_freq.get(w, 0) for w in words) / len(words)

scored = [(score_sentence(s), s) for s in sentences]
scored.sort(reverse=True, key=lambda x: x[0])

summary_sentences = [s for _, s in scored[:${sentencesCount}]]
summary = ' '.join(summary_sentences)

result = {"summary": summary, "originalLength": len(text), "summaryLength": len(summary), "sentences": ${sentencesCount}}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "keywords": {
        const code = `${baseCode}
import re
from collections import Counter

text = """${(inputText || "").replace(/"/g, '\\"')}"""

stopwords = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'just', 'don', 'now', 'and', 'or', 'but', 'if', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'it', 'its'}

words = re.findall(r'\\b[a-zA-Z]{3,}\\b', text.lower())
words = [w for w in words if w not in stopwords]

freq = Counter(words)
keywords = [{"word": word, "count": count} for word, count in freq.most_common(${topN})]

result = {"keywords": keywords}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "detect_language": {
        const code = `${baseCode}
try:
    from langdetect import detect, detect_langs
except ImportError:
    output({"ok": False, "error": "langdetect not installed. Run: pip install langdetect"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

try:
    lang = detect(text)
    probs = detect_langs(text)
    result = {"language": lang, "probabilities": [{"lang": l.lang, "prob": round(l.prob, 4)} for l in probs]}
except:
    result = {"language": "unknown"}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "readability": {
        const code = `${baseCode}
import re

text = """${(inputText || "").replace(/"/g, '\\"')}"""

sentences = len(re.findall(r'[.!?]+', text))
words = len(re.findall(r'\\b\\w+\\b', text))
syllables = sum(len(re.findall(r'[aeiouy]+', word, re.I)) for word in re.findall(r'\\b\\w+\\b', text.lower()))
chars = len(re.findall(r'[a-zA-Z]', text))

if sentences == 0: sentences = 1
if words == 0: words = 1

flesch_kincaid = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
flesch_kincaid = max(0, min(100, flesch_kincaid))

grade_level = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
grade_level = max(0, grade_level)

result = {
    "fleschKincaid": round(flesch_kincaid, 2),
    "gradeLevel": round(grade_level, 2),
    "sentences": sentences,
    "words": words,
    "syllables": syllables,
    "characters": chars,
    "avgWordsPerSentence": round(words / sentences, 2),
    "readingEase": "easy" if flesch_kincaid > 60 else ("difficult" if flesch_kincaid < 40 else "moderate")
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "word_frequency": {
        const code = `${baseCode}
import re
from collections import Counter

text = """${(inputText || "").replace(/"/g, '\\"')}"""

words = re.findall(r'\\b\\w+\\b', text.lower())
freq = Counter(words)
most_common = [{"word": w, "count": c} for w, c in freq.most_common(${topN})]

result = {"wordFrequency": most_common, "totalWords": len(words), "uniqueWords": len(freq)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "ngrams": {
        const code = `${baseCode}
import re
from collections import Counter

text = """${(inputText || "").replace(/"/g, '\\"')}"""

words = re.findall(r'\\b\\w+\\b', text.lower())
n = ${nGramSize}

ngrams = [' '.join(words[i:i+n]) for i in range(len(words)-n+1)]
freq = Counter(ngrams)
most_common = [{"ngram": ng, "count": c} for ng, c in freq.most_common(${topN})]

result = {"ngrams": most_common, "size": ${nGramSize}}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "topic_model": {
        const numTopics = options.numTopics || 5;
        const code = `${baseCode}
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.decomposition import NMF
    import re
except ImportError:
    output({"ok": False, "error": "scikit-learn not installed"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

sentences = re.split(r'(?<=[.!?])\\s+', text)
sentences = [s.strip() for s in sentences if len(s.strip()) > 30]

if len(sentences) < ${numTopics}:
    result = {"topics": [], "error": "Not enough sentences for topic modeling"}
    output(result)
    exit()

vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
tfidf = vectorizer.fit_transform(sentences)

nmf = NMF(n_components=${numTopics}, random_state=42)
nmf.fit(tfidf)

feature_names = vectorizer.get_feature_names_out()
topics = []
for topic_idx, topic in enumerate(nmf.components_):
    top_words = [feature_names[i] for i in topic.argsort()[:-11:-1]]
    topics.append({"topic": topic_idx + 1, "words": top_words})

result = {"topics": topics}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "clean": {
        const code = `${baseCode}
import re

text = """${(inputText || "").replace(/"/g, '\\"')}"""

original = text

text = re.sub(r'<[^>]+>', '', text)
text = re.sub(r'http[s]?://\\S+', '', text)
text = re.sub(r'\\S+@\\S+', '', text)
text = re.sub(r'\\s+', ' ', text)
text = re.sub(r'[^a-zA-Z0-9\\s.,!?;:\\-\\'"()]', '', text)
text = text.strip()

result = {
    "cleaned": text,
    "originalLength": len(original),
    "cleanedLength": len(text),
    "reduction": round((1 - len(text)/len(original)) * 100, 2) if len(original) > 0 else 0
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "extract_urls": {
        const code = `${baseCode}
import re

text = """${(inputText || "").replace(/"/g, '\\"')}"""

urls = re.findall(r'https?://[^\\s<>"{}|\\\\^\\[\\]]+', text)

result = {"urls": urls, "count": len(urls)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "extract_emails": {
        const code = `${baseCode}
import re

text = """${(inputText || "").replace(/"/g, '\\"')}"""

emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', text)

result = {"emails": emails, "count": len(emails)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "extract_dates": {
        const code = `${baseCode}
import re

text = """${(inputText || "").replace(/"/g, '\\"')}"""

date_patterns = [
    r'\\d{4}-\\d{2}-\\d{2}',
    r'\\d{2}/\\d{2}/\\d{4}',
    r'\\d{2}-\\d{2}-\\d{4}',
    r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \\d{1,2},? \\d{4}',
    r'\\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \\d{4}'
]

dates = []
for pattern in date_patterns:
    dates.extend(re.findall(pattern, text, re.I))

result = {"dates": list(set(dates)), "count": len(set(dates))}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "translate": {
        if (!targetLanguage) throw new Error("targetLanguage is required for translation");
        const code = `${baseCode}
try:
    from deep_translator import GoogleTranslator
except ImportError:
    output({"ok": False, "error": "deep_translator not installed. Run: pip install deep-translator"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

try:
    translator = GoogleTranslator(source='auto', target='${targetLanguage}')
    translated = translator.translate(text[:5000])
    result = {"translated": translated, "sourceLanguage": "auto", "targetLanguage": "${targetLanguage}"}
except Exception as e:
    result = {"ok": False, "error": str(e)}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "spell_check": {
        const code = `${baseCode}
try:
    from textblob import TextBlob
except ImportError:
    output({"ok": False, "error": "textblob not installed"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

blob = TextBlob(text)
misspelled = []

for word in blob.words:
    corrected = str(word.correct())
    if corrected.lower() != word.lower():
        misspelled.append({"original": word, "suggestion": corrected})

result = {"misspelled": misspelled, "count": len(misspelled)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "correct_spelling": {
        const code = `${baseCode}
try:
    from textblob import TextBlob
except ImportError:
    output({"ok": False, "error": "textblob not installed"})
    exit()

text = """${(inputText || "").replace(/"/g, '\\"')}"""

blob = TextBlob(text)
corrected = str(blob.correct())

result = {"corrected": corrected, "original": text}
output(result)
`;
        return parseResult(await execPython(code));
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
