import * as yaml from "yaml";
import { SorterConfig } from "./types";
import { DEFAULT_TRANSFORMABLE_LIST_KEYS } from "./constants";

const MERGE_KEY_GROUP_INDEX = -999;
const TRANSFORMABLE_KEYS_SET = new Set(DEFAULT_TRANSFORMABLE_LIST_KEYS);

export class DockerComposeSorter {
  public static sort(yamlText: string, config: SorterConfig, indent: number = 2): string {
    const usesCrlf = yamlText.includes("\r\n");
    const source = usesCrlf ? yamlText.replace(/\r\n/g, "\n") : yamlText;

    const docs = yaml.parseAllDocuments(source, {
      keepSourceTokens: false // Regenerate tokens for clean sorting
    });

    if (docs.length === 0) {
      return yamlText;
    }

    for (const doc of docs) {
      if (doc.errors.length > 0) {
        throw new Error(`Invalid YAML: ${doc.errors[0].message}`);
      }
    }

    // Single non-map document (scalar, list, empty): nothing to sort
    if (docs.length === 1 && (!docs[0].contents || !yaml.isMap(docs[0].contents))) {
      return yamlText;
    }

    let output = docs
      .map((doc) => this.processDocument(doc, config, indent))
      .map((text, index) => (index > 0 && !text.startsWith("---") ? `---\n${text}` : text))
      .join("");

    if (config.addDocumentSeparator && !output.startsWith("---")) {
      output = "---\n" + output;
    }

    return usesCrlf ? output.replace(/\n/g, "\r\n") : output;
  }

  private static processDocument(doc: yaml.Document, config: SorterConfig, indent: number): string {
    const stringifyOptions: yaml.ToStringOptions = {
      lineWidth: 0,
      minContentWidth: 0,
      indent
    };

    if (!doc.contents || !yaml.isMap(doc.contents)) {
      return doc.toString(stringifyOptions);
    }

    const contents = doc.contents as yaml.YAMLMap;

    // 1. Remove Version if requested
    if (config.removeVersionKey && contents.has("version")) {
      contents.delete("version");
    }

    // 2. Sort Top Level
    this.sortMap(contents, config.topLevelKeyOrder, true);

    // 3. Process Services
    const serviceKeyGroups = config.useServiceKeyGroups
      ? this.getServiceKeyGroups(config)
      : undefined;
    const serviceInternalBlankLines = new Map<yaml.YAMLMap, Map<number, number>>();
    const services = contents.get("services");
    if (services && yaml.isMap(services)) {
      services.items.forEach((pair) => {
        if (yaml.isMap(pair.value)) {
          if (serviceKeyGroups) {
            const serviceMap = pair.value as yaml.YAMLMap;
            serviceInternalBlankLines.set(
              serviceMap,
              this.captureInternalBlankLines(serviceMap, serviceKeyGroups)
            );
            this.sortMapByGroups(serviceMap, serviceKeyGroups);
          } else {
            this.sortMap(pair.value as yaml.YAMLMap, config.serviceKeyOrder);
          }
        }
      });
    }

    // 4. Transform Lists ["KEY=VAL"] -> { KEY: VAL }
    if (config.transformKeyValueLists) {
      this.transformListsToMaps(doc);
    }

    // 5. Apply Spacing
    this.applySpacing(contents, config, serviceKeyGroups, serviceInternalBlankLines);

    // 6. Serialize
    return doc.toString(stringifyOptions);
  }

  private static sortMap(
    map: yaml.YAMLMap,
    order: string[],
    extensionKeysFirst: boolean = false
  ): void {
    map.items.sort((a, b) => {
      const keyA = String(a.key);
      const keyB = String(b.key);

      const idxA = order.indexOf(keyA);
      const idxB = order.indexOf(keyB);

      // Prioritize YAML merge keys ("<<") to the top of mappings unless explicitly ordered
      const isMergeA = keyA === "<<" && idxA === -1;
      const isMergeB = keyB === "<<" && idxB === -1;
      if (isMergeA && isMergeB) {
        return 0;
      }
      if (isMergeA) {
        return -1;
      }
      if (isMergeB) {
        return 1;
      }

      // Extension fields (x-*) usually hold YAML anchors, so they must stay
      // before the keys that reference them. Keep their original relative
      // order (anchors may reference each other) unless explicitly configured.
      const extA = extensionKeysFirst && idxA === -1 && keyA.startsWith("x-");
      const extB = extensionKeysFirst && idxB === -1 && keyB.startsWith("x-");
      if (extA && extB) {
        return 0;
      }
      if (extA) {
        return -1;
      }
      if (extB) {
        return 1;
      }

      if (idxA > -1 && idxB > -1) {
        return idxA - idxB;
      }
      if (idxA > -1) {
        return -1;
      }
      if (idxB > -1) {
        return 1;
      }

      return keyA.localeCompare(keyB);
    });
  }

  private static getServiceKeyGroups(config: SorterConfig): string[][] | undefined {
    const groups = config.serviceKeyGroups;
    return groups && groups.length > 0 ? groups : undefined;
  }

  private static getGroupPosition(
    key: string,
    keyOrder: Map<string, { groupIndex: number; keyIndex: number }>
  ): { groupIndex: number; keyIndex: number } | undefined {
    const position = keyOrder.get(key);
    if (position !== undefined) {
      return position;
    }
    // Untracked merge key ("<<") gets prioritized before all configured groups
    if (key === "<<") {
      return { groupIndex: MERGE_KEY_GROUP_INDEX, keyIndex: 0 };
    }
    return undefined;
  }

  private static sortMapByGroups(map: yaml.YAMLMap, groups: string[][]): void {
    const keyOrder = this.createGroupKeyOrder(groups);

    map.items.sort((a, b) => {
      const keyA = String(a.key);
      const keyB = String(b.key);

      const positionA = this.getGroupPosition(keyA, keyOrder);
      const positionB = this.getGroupPosition(keyB, keyOrder);

      if (positionA && positionB) {
        if (positionA.groupIndex !== positionB.groupIndex) {
          return positionA.groupIndex - positionB.groupIndex;
        }
        return positionA.keyIndex - positionB.keyIndex;
      }
      if (positionA) {
        return -1;
      }
      if (positionB) {
        return 1;
      }

      return keyA.localeCompare(keyB);
    });
  }

  private static createGroupKeyOrder(
    groups: string[][]
  ): Map<string, { groupIndex: number; keyIndex: number }> {
    const keyOrder = new Map<string, { groupIndex: number; keyIndex: number }>();

    groups.forEach((keys, groupIndex) => {
      keys.forEach((key, keyIndex) => {
        if (!keyOrder.has(key)) {
          keyOrder.set(key, { groupIndex, keyIndex });
        }
      });
    });

    return keyOrder;
  }

  private static captureInternalBlankLines(
    map: yaml.YAMLMap,
    groups: string[][]
  ): Map<number, number> {
    const keyOrder = this.createGroupKeyOrder(groups);
    const blankLines = new Map<number, number>();

    map.items.forEach((item, index) => {
      if (index === 0 || !yaml.isScalar(item.key) || !yaml.isScalar(map.items[index - 1].key)) {
        return;
      }

      const currentSection = this.getGroupPosition(String(item.key), keyOrder)?.groupIndex ?? -1;
      const previousSection =
        this.getGroupPosition(String(map.items[index - 1].key), keyOrder)?.groupIndex ?? -1;

      if (currentSection === previousSection && item.key.spaceBefore === true) {
        blankLines.set(currentSection, (blankLines.get(currentSection) ?? 0) + 1);
      }
    });

    return blankLines;
  }

  private static transformListsToMaps(doc: yaml.Document): void {
    yaml.visit(doc, {
      Pair(_, pair) {
        // Keys can be non-scalar (e.g. merge keys or complex keys): leave those untouched
        if (!yaml.isScalar(pair.key) || typeof pair.key.value !== "string") {
          return undefined;
        }

        const key = pair.key.value;
        // Restrict list-to-map conversion to recognized compose keys
        if (!TRANSFORMABLE_KEYS_SET.has(key)) {
          return undefined;
        }

        if (yaml.isSeq(pair.value) && DockerComposeSorter.canTransformSeq(pair.value)) {
          pair.value = DockerComposeSorter.seqToMap(pair.value);
        }
      }
    });
  }

  private static canTransformSeq(seq: yaml.YAMLSeq): boolean {
    if (seq.items.length === 0) {
      return false;
    }
    return seq.items.every((item) => {
      if (!yaml.isScalar(item) || typeof item.value !== "string") {
        return false;
      }
      const str = item.value;
      const eqIndex = str.indexOf("=");
      // Must contain '=' and have a non-empty key before '='
      return eqIndex > 0 && str.slice(0, eqIndex).trim().length > 0;
    });
  }

  private static seqToMap(seq: yaml.YAMLSeq): yaml.YAMLMap {
    const map = new yaml.YAMLMap();
    if (seq.commentBefore) {
      map.commentBefore = seq.commentBefore;
    }
    if (seq.comment) {
      map.comment = seq.comment;
    }

    seq.items.forEach((item) => {
      if (yaml.isScalar(item) && typeof item.value === "string") {
        const eqIndex = item.value.indexOf("=");
        const key = item.value.slice(0, eqIndex).trim();
        const val = item.value.slice(eqIndex + 1);

        // Preserve comments
        const pair = new yaml.Pair(new yaml.Scalar(key), new yaml.Scalar(val));
        if (item.comment) {
          pair.value!.comment = item.comment;
        }
        if (item.commentBefore) {
          pair.key!.commentBefore = item.commentBefore;
        }

        map.add(pair);
      }
    });
    return map;
  }

  private static applySpacing(
    contents: yaml.YAMLMap,
    config: SorterConfig,
    serviceKeyGroups?: string[][],
    serviceInternalBlankLines: Map<yaml.YAMLMap, Map<number, number>> = new Map()
  ): void {
    const resetSpacing = (node: any) => {
      if (node && node.key) {
        node.key.spaceBefore = false;
      }
    };

    contents.items.forEach(resetSpacing);

    // Top Level Spacing
    if (config.addBlankLinesTopLevel) {
      contents.items.forEach((item, index) => {
        if (index > 0 && yaml.isScalar(item.key)) {
          item.key.spaceBefore = true;
          this.stripBoundaryCommentBlanks(contents.items[index - 1].value);
        }
      });
    }

    // Service Level Spacing
    const services = contents.get("services");
    if (services && yaml.isMap(services)) {
      if (config.addBlankLinesServices) {
        services.items.forEach((item, index) => {
          if (index > 0 && yaml.isScalar(item.key)) {
            item.key.spaceBefore = true;
            this.stripBoundaryCommentBlanks(services.items[index - 1].value);
          }
        });
      }

      if (serviceKeyGroups) {
        services.items.forEach((item) => {
          if (yaml.isMap(item.value)) {
            this.applyGroupSpacing(
              item.value as yaml.YAMLMap,
              serviceKeyGroups,
              config.preserveBlankLinesWithinServiceKeyGroups,
              serviceInternalBlankLines.get(item.value as yaml.YAMLMap)
            );
          }
        });
      }
    }
  }

  private static applyGroupSpacing(
    map: yaml.YAMLMap,
    groups: string[][],
    preserveInternalSpacing: boolean,
    internalBlankLines: Map<number, number> = new Map()
  ): void {
    const keyOrder = this.createGroupKeyOrder(groups);
    let previousGroupIndex: number | undefined;

    map.items.forEach((item, index) => {
      if (!yaml.isScalar(item.key)) {
        previousGroupIndex = undefined;
        return;
      }

      const groupPosition = this.getGroupPosition(String(item.key), keyOrder);
      const groupIndex = groupPosition?.groupIndex;

      const startsUntrackedSection = groupIndex === undefined && previousGroupIndex !== undefined;
      const startsConfiguredGroup = groupIndex !== undefined && groupIndex !== previousGroupIndex;

      if (index === 0) {
        item.key.spaceBefore = false;
      } else if (startsConfiguredGroup || startsUntrackedSection) {
        // Group boundaries are always normalized to one blank line.
        item.key.spaceBefore = true;
        this.stripBoundaryCommentBlanks(map.items[index - 1].value);
      } else if (!preserveInternalSpacing) {
        // In legacy grouped-spacing mode, remove blanks inside groups and the
        // implicit group containing unknown keys.
        item.key.spaceBefore = false;
      } else if (groupIndex === previousGroupIndex) {
        const remaining = internalBlankLines.get(groupIndex ?? -1) ?? 0;
        item.key.spaceBefore = remaining > 0;
        if (remaining > 0) {
          internalBlankLines.set(groupIndex ?? -1, remaining - 1);
        }
      }

      previousGroupIndex = groupIndex;
    });
  }

  /**
   * The blank line that separates a block from the following sibling is owned
   * by that sibling's `spaceBefore` flag. A trailing comment that closes the
   * preceding block can *also* encode those blank lines as trailing newlines in
   * its `comment` string. Left untouched they stack with `spaceBefore` and grow
   * by one on every format run (issue #21), breaking idempotency.
   *
   * Strip the trailing blank-line newlines from the comment that renders right
   * before the next sibling: the outermost trailing comment along the rightmost
   * spine of `prevValue`. Inner comments and `commentBefore` are left alone, so
   * blank lines *inside* a block are preserved.
   */
  private static stripBoundaryCommentBlanks(prevValue: unknown): void {
    let node = prevValue as
      | {
          comment?: unknown;
          items?: unknown[];
          spaceBefore?: unknown;
          value?: unknown;
          type?: unknown;
        }
      | null
      | undefined;

    while (node) {
      if (typeof node.comment === "string") {
        // Outermost trailing comment found: normalize it only if it carries
        // boundary blank lines, then stop (deeper comments stay intra-block).
        node.comment = node.comment.replace(/\n+$/, "");
        if (
          yaml.isScalar(node) &&
          (node.value === null ||
            node.value === undefined ||
            (node.value === "" && node.type === "PLAIN"))
        ) {
          node.spaceBefore = false;
        }
        return;
      }

      // Descend along the rightmost spine (last child) toward the boundary.
      if (!yaml.isMap(node) && !yaml.isSeq(node)) {
        if (
          yaml.isScalar(node) &&
          (node.value === null ||
            node.value === undefined ||
            (node.value === "" && node.type === "PLAIN"))
        ) {
          node.spaceBefore = false;
        }
        return;
      }
      const items = node.items;
      if (!items || items.length === 0) {
        return;
      }
      const last = items[items.length - 1];
      node = (yaml.isPair(last) ? last.value : last) as typeof node;
    }
  }
}
