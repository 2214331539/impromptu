const ICP_URL = "https://beian.miit.gov.cn/";
const ICP_NUMBER = "京ICP备2024090832号-3";

export function IcpFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`w-full py-4 text-center text-xs text-muted ${className}`}>
      <a
        href={ICP_URL}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="transition hover:text-ink"
      >
        {ICP_NUMBER}
      </a>
    </footer>
  );
}
