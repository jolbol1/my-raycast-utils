import { Toast, showToast } from "@raycast/api";

interface MiseTask {
  title: string;
  successTitle: string;
  failureTitle: string;
  task: () => Promise<unknown>;
  onDone?: () => void | Promise<void>;
}

/**
 * Runs a mise command behind a progress toast. mise installs can take minutes, so the
 * toast is the only feedback the user gets until the command returns.
 */
export const runMiseTask = async ({ title, successTitle, failureTitle, task, onDone }: MiseTask) => {
  const toast = await showToast({ style: Toast.Style.Animated, title });

  try {
    await task();
    toast.style = Toast.Style.Success;
    toast.title = successTitle;
    toast.message = undefined;
    await onDone?.();
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = failureTitle;
    toast.message = error instanceof Error ? error.message : String(error);
  }
};
