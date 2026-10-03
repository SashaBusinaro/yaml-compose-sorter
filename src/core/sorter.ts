import * as yaml from "yaml";
import { SorterConfig } from "./types";

const MERGE_KEY_GROUP_INDEX = -999;

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

    const output = docs
      .map((doc, index) => this.processDocument(doc, config, indent, index > 0))
      .join("");

    return usesCrlf ? output.replace(/\n/g, "\r\n") : output;
  }

  private static processDocument(
    doc: yaml.Document,
    config: SorterConfig,
    indent: number,
    isSubsequentDocument: boolean = false
  ): string {
    if (config.addDocumentSeparator || isSubsequentDocument) {
      if (doc.directives) {
        doc.directives.docStart = true;
      }
    }

    const stringifyOptions: yaml.ToStringOptions = {
      lineWidth: 0,
      minContentWidth: 0,
      indent
    };

    if (!doc.contents || !yaml.isMap(doc.contents)) {
      return doc.toString(stringifyOptions);
    }

    const contents = doc.contents as yaml.YAMLMap;

    // The parser attaches an adjacent root header to the first key. Promote it
    // to the mapping so it stays at the start when that key moves or is removed.
    const firstKey = contents.items[0]?.key;
    if (yaml.isNode(firstKey) && firstKey.commentBefore) {
      contents.commentBefore = this.joinComments(contents.commentBefore, firstKey.commentBefore);
      firstKey.commentBefore = undefined;
    }

    // 1. Remove Version if requested
    if (config.removeVersionKey && contents.has("version")) {
      this.removeVersion(doc, contents);
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

  private static joinComments(...comments: (string | null | undefined)[]): string | undefined {
    const present = comments.filter((comment): comment is string => Boolean(comment));
    return present.length > 0 ? present.join("\n") : undefined;
  }

  private static removeVersion(doc: yaml.Document, contents: yaml.YAMLMap): void {
    const pair = contents.items.find(
      (item) => yaml.isScalar(item.key) && item.key.value === "version"
    );
    if (!pair) {
      return;
    }
    const comments: string[] = [];
    const anchoredNodes = new Set<yaml.Node>();
    for (const node of [pair.key, pair.value]) {
      if (yaml.isNode(node)) {
        yaml.visit(node, {
          Node(_, child) {
            if (child.anchor) {
              anchoredNodes.add(child);
            }
            if (child.commentBefore) {
              comments.push(child.commentBefore);
            }
            if (child.comment) {
              comments.push(child.comment);
            }
          }
        });
      }
    }
    let referenced = false;
    if (anchoredNodes.size > 0) {
      yaml.visit(doc, {
        Alias(_, alias) {
          const target = alias.resolve(doc);
          if (target && anchoredNodes.has(target)) {
            referenced = true;
            return yaml.visit.BREAK;
          }
        }
      });
    }
    // Deleting a referenced anchor would leave an invalid YAML document.
    if (!referenced) {
      contents.commentBefore = this.joinComments(contents.commentBefore, ...comments);
      contents.delete("version");
    }
  }

  private static sortMap(
    map: yaml.YAMLMap,
    order: string[],
    extensionKeysFirst: boolean = false
  ): void {
    this.sortPreservingAnchors(map, (a, b) => {
      const keyA = String(a.key);
      const keyB = String(b.key);

      const idxA = order.indexOf(keyA);
      const idxB = order.indexOf(keyB);

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

  /** Keep anchor/alias events in source order, including shadowed anchor names. */
  private static sortPreservingAnchors(
    map: yaml.YAMLMap,
    compare: (a: yaml.Pair, b: yaml.Pair) => number
  ): void {
    const protectedPairs = map.items.filter((pair) =>
      [pair.key, pair.value].some((node) => {
        if (!yaml.isNode(node)) {
          return false;
        }
        let hasAnchorOrAlias = false;
        yaml.visit(node, {
          Node(_, child) {
            if (yaml.isAlias(child) || child.anchor) {
              hasAnchorOrAlias = true;
              return yaml.visit.BREAK;
            }
          }
        });
        return hasAnchorOrAlias;
      })
    );
    const protectedSet = new Set(protectedPairs);
    const pending = [...map.items].sort(compare);
    const sorted: yaml.Pair[] = [];
    let nextProtected = 0;

    // Take the highest-priority eligible pair. Unrelated keys remain sortable,
    // while pairs containing anchors/aliases retain their original relative order.
    while (pending.length > 0) {
      const index = pending.findIndex(
        (pair) => !protectedSet.has(pair) || pair === protectedPairs[nextProtected]
      );
      const [pair] = pending.splice(index, 1);
      sorted.push(pair);
      if (protectedSet.has(pair)) {
        nextProtected++;
      }
    }
    map.items = sorted;
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

    this.sortPreservingAnchors(map, (a, b) => {
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
    type Context = "compose" | "services" | "service" | "build" | "deploy" | "hook";
    const visited = new Map<yaml.Node, Set<Context>>();
    const sequences = new Set<yaml.YAMLSeq>();
    const resolve = (node: unknown): unknown => (yaml.isAlias(node) ? node.resolve(doc) : node);

    const collect = (source: unknown, context: Context): void => {
      const node = resolve(source);
      if (!yaml.isMap(node)) {
        return;
      }
      const contexts = visited.get(node) ?? new Set<Context>();
      if (contexts.has(context)) {
        return;
      }
      contexts.add(context);
      visited.set(node, contexts);

      for (const pair of node.items) {
        if (!yaml.isScalar(pair.key) || typeof pair.key.value !== "string") {
          continue;
        }
        const key = pair.key.value;
        const value = resolve(pair.value);
        if (key === "<<") {
          // Only fragments actually used in a Compose context are transformed.
          for (const fragment of yaml.isSeq(value) ? value.items : [value]) {
            collect(fragment, context);
          }
        } else if (context === "compose") {
          if (key === "services") {
            collect(value, "services");
          }
        } else if (context === "services") {
          if (!key.startsWith("x-")) {
            collect(value, "service");
          }
        } else {
          const transformable =
            (key === "environment" && (context === "service" || context === "hook")) ||
            (key === "labels" && context !== "hook") ||
            (key === "extra_hosts" && (context === "service" || context === "build")) ||
            (key === "args" && context === "build");
          if (transformable && yaml.isSeq(value)) {
            sequences.add(value);
          } else if (context === "service") {
            if (key === "build" || key === "deploy") {
              collect(value, key);
            } else if ((key === "post_start" || key === "pre_stop") && yaml.isSeq(value)) {
              value.items.forEach((hook) => collect(hook, "hook"));
            }
          }
        }
      }
    };

    if (yaml.isMap(doc.contents)) {
      collect(doc.contents, "compose");
    }
    yaml.visit(doc, {
      Seq(_, seq) {
        if (sequences.has(seq) && DockerComposeSorter.canTransformSeq(seq)) {
          return DockerComposeSorter.seqToMap(seq);
        }
      }
    });
  }

  private static canTransformSeq(seq: yaml.YAMLSeq): boolean {
    if (seq.items.length === 0 || (seq.tag && seq.tag !== "!override" && seq.tag !== "!reset")) {
      return false;
    }
    const seenKeys = new Set<string>();
    return seq.items.every((item) => {
      // Splitting an anchored/tagged scalar would change what its aliases mean.
      if (!yaml.isScalar(item) || typeof item.value !== "string" || item.anchor || item.tag) {
        return false;
      }
      const str = item.value;
      const eqIndex = str.indexOf("=");
      // Must contain '=' and have a non-empty key before '='
      if (eqIndex <= 0 || str.slice(0, eqIndex).trim().length === 0) {
        return false;
      }
      const key = str.slice(0, eqIndex).trim();
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });
  }

  private static seqToMap(seq: yaml.YAMLSeq): yaml.YAMLMap {
    const map = new yaml.YAMLMap(seq.schema);
    map.anchor = seq.anchor;
    map.tag = seq.tag;
    map.flow = seq.flow;
    map.spaceBefore = seq.spaceBefore;
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
        pair.key!.spaceBefore = item.spaceBefore;

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
