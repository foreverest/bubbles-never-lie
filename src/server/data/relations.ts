import type {
  AuthorEntity,
  AuthorRepository,
  CommentEntity,
  PostEntity,
  PostRepository,
} from './types';

export type PostRelationOptions = {
  authors?: true;
};

export type CommentRelationOptions = {
  posts?: true;
  authors?: true;
};

export type HydratedPost<Options extends PostRelationOptions> = PostEntity &
  (Options extends { authors: true } ? { author: AuthorEntity | null } : {});

export type HydratedComment<Options extends CommentRelationOptions> = CommentEntity &
  (Options extends { posts: true } ? { post: PostEntity | null } : {}) &
  (Options extends { authors: true } ? { author: AuthorEntity | null } : {});

export type RelationHydrators = {
  hydratePostRelations<Options extends PostRelationOptions>(
    posts: PostEntity[],
    options: Options
  ): Promise<Array<HydratedPost<Options>>>;
  hydrateCommentRelations<Options extends CommentRelationOptions>(
    comments: CommentEntity[],
    options: Options
  ): Promise<Array<HydratedComment<Options>>>;
};

type RelationHydratorRepositories = {
  posts: PostRepository;
  authors: AuthorRepository;
};

export const createRelationHydrators = ({
  posts: postRepository,
  authors: authorRepository,
}: RelationHydratorRepositories): RelationHydrators => ({
  async hydratePostRelations(posts, options) {
    const authorsByName = options.authors
      ? await loadEntitiesById(
          uniqueItems(posts.map((post) => post.authorName)),
          authorRepository
        )
      : null;

    return posts.map((post) => {
      const hydrated: PostEntity & { author?: AuthorEntity | null } = { ...post };

      if (options.authors) {
        hydrated.author = authorsByName?.get(post.authorName) ?? null;
      }

      return hydrated as HydratedPost<typeof options>;
    });
  },

  async hydrateCommentRelations(comments, options) {
    const [postsById, authorsByName] = await Promise.all([
      options.posts
        ? loadEntitiesById(
            uniqueItems(comments.map((comment) => comment.postId)),
            postRepository
          )
        : Promise.resolve(null),
      options.authors
        ? loadEntitiesById(
            uniqueItems(comments.map((comment) => comment.authorName)),
            authorRepository
          )
        : Promise.resolve(null),
    ]);

    return comments.map((comment) => {
      const hydrated: CommentEntity & {
        post?: PostEntity | null;
        author?: AuthorEntity | null;
      } = { ...comment };

      if (options.posts) {
        hydrated.post = postsById?.get(comment.postId) ?? null;
      }

      if (options.authors) {
        hydrated.author = authorsByName?.get(comment.authorName) ?? null;
      }

      return hydrated as HydratedComment<typeof options>;
    });
  },
});

const loadEntitiesById = async <Entity extends { id: string }>(
  ids: string[],
  repository: { getByIds(ids: string[]): Promise<Entity[]> }
): Promise<Map<string, Entity>> => {
  const entities = await repository.getByIds(ids);

  return new Map(entities.map((entity) => [entity.id, entity]));
};

const uniqueItems = (items: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  items.forEach((item) => {
    if (seen.has(item)) {
      return;
    }

    seen.add(item);
    unique.push(item);
  });

  return unique;
};
