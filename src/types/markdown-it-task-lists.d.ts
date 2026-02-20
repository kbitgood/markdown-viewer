declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  type TaskListPluginOptions = {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  };
  function taskLists(md: MarkdownIt, options?: TaskListPluginOptions): void;
  export default taskLists;
}
