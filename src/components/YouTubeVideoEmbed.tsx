interface YouTubeVideoEmbedProps {
  videoId: string;
  title: string;
  isCardView?: boolean;
}

export function YouTubeVideoEmbed({ 
  videoId, 
  title, 
  isCardView = false 
}: YouTubeVideoEmbedProps) {
  return (
    <div>
      <iframe
        width={isCardView ? "100%" : "640"}
        height={isCardView ? "200" : "360"}
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="rounded border w-full"
      />
    </div>
  );
}


