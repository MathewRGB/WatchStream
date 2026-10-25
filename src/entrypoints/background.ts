import { openSessionPage } from '@/background/open-session-page';

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void openSessionPage();
  });
});
