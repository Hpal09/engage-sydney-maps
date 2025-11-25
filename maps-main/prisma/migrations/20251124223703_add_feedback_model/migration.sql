-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_place_id_idx" ON "feedback"("place_id");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
