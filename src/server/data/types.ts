export type TimeRange = {
  startTime: number;
  endTime: number;
};

export type PostEntity = {
  id: string;
  title: string;
  authorName: string;
  comments: number;
  score: number;
  createdAt: string;
  permalink: string;
};

export type CommentEntity = {
  id: string;
  postId: string;
  authorName: string;
  score: number;
  bodyPreview: string;
  createdAt: string;
  permalink: string;
};

export type AuthorEntity = {
  id: string;
  avatarUrl: string | null;
  subredditKarma: number | null;
  fetchedAt: string;
};

export type EntityRepository<Entity> = {
  getById(id: string): Promise<Entity | null>;
  getByIds(ids: string[]): Promise<Entity[]>;
  upsert(entity: Entity): Promise<void>;
  upsertMany(entities: Entity[]): Promise<void>;
};

export type TimeIndexedEntityRepository<Entity> = EntityRepository<Entity> & {
  getIdsInTimeRange(range: TimeRange): Promise<string[]>;
  getInTimeRange(range: TimeRange): Promise<Entity[]>;
  countInTimeRange(range: TimeRange): Promise<number>;
};

export type PostRepository = TimeIndexedEntityRepository<PostEntity>;
export type CommentRepository = TimeIndexedEntityRepository<CommentEntity>;
export type AuthorRepository = EntityRepository<AuthorEntity>;
